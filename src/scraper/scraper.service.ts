import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { createHash } from 'crypto';
import * as cheerio from 'cheerio';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  constructor(private prisma: PrismaService) {}

  async scrapeWanted(jobGroupId = 518) {
    const limit = 20;
    let offset = 0;
    let saved = 0;
    let skipped = 0;
    let total = 0;

    while (true) {
      const url = `https://www.wanted.co.kr/api/chaos/navigation/v1/results?${Date.now()}=&job_group_id=${jobGroupId}&country=kr&job_sort=job.popularity_order&years=-1&locations=all&limit=${limit}&offset=${offset}`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'wanted-user-agent': 'user-web',
          accept: 'application/json',
        },
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`원티드 ${res.status}: ${body}`);
        throw new Error(`원티드 응답 오류: ${res.status} (offset ${offset})`);
      }

      const json = await res.json();
      const positions = json.data ?? [];
      if (positions.length === 0) break;

      total += positions.length;

      for (const p of positions) {
        const sourceUrl = `https://www.wanted.co.kr/wd/${p.id}`;
        const location = [p.address?.location, p.address?.district]
          .filter(Boolean)
          .join(' ');
        const rawText = `${p.position} / ${p.company?.name ?? ''}`;
        const hash = createHash('sha256').update(rawText).digest('hex');

        const exists = await this.prisma.job.findUnique({
          where: { contentHash: hash },
        });
        if (exists) {
          skipped++;
          continue;
        }

        await this.prisma.job.create({
          data: {
            source: 'wanted',
            sourceUrl,
            title: p.position,
            company: p.company?.name ?? '미상',
            location: location || null,
            contentHash: hash,
            rawText,
          },
        });
        saved++;
      }

      offset += limit;
      await new Promise((r) => setTimeout(r, 1000)); // 1초 쉬고 다음 페이지
    }

    this.logger.log(`원티드 수집 완료 - 전체 ${total}건, 신규 ${saved}, 중복 ${skipped}`);
    return { total, saved, skipped };
  }
  
  async scrapeWantedDetails(batchSize = 100) {
    const targets = await this.prisma.job.findMany({
      where: { source: 'wanted', detailFetched: false },
      take: batchSize,
    });

    if (targets.length === 0) {
      this.logger.log('상세 수집할 공고 없음 (전부 완료)');
      return { processed: 0, failed: 0, remaining: 0 };
    }

    let processed = 0;
    let failed = 0;

    for (const job of targets) {
      const wantedId = job.sourceUrl.split('/').pop();
      const url = `https://www.wanted.co.kr/api/chaos/jobs/v4/${wantedId}/details?${Date.now()}=`;

      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'wanted-user-agent': 'user-web',
            accept: 'application/json',
          },
        });

        if (!res.ok) {
          this.logger.warn(`공고 ${wantedId} 상세 실패: ${res.status}`);
          failed++;
          await this.sleep(1000);
          continue;
        }

        const json = await res.json();
        const detail = json.data?.job?.detail;

        if (!detail) {
          this.logger.warn(`공고 ${wantedId} detail 없음`);
          failed++;
          await this.sleep(1000);
          continue;
        }

        const fullText = [
          detail.intro,
          detail.main_tasks,
          detail.requirements,
          detail.preferred_points,
          detail.benefits,
        ]
          .filter(Boolean)
          .join('\n\n');

        await this.prisma.job.update({
          where: { id: job.id },
          data: {
            mainTasks: detail.main_tasks ?? null,
            requirements: detail.requirements ?? null,
            preferredPoints: detail.preferred_points ?? null,
            benefits: detail.benefits ?? null,
            rawText: fullText,
            detailFetched: true,
          },
        });

        processed++;
        if (processed % 20 === 0) {
          this.logger.log(`진행 중... ${processed}건 완료`);
        }
      } catch (err) {
        this.logger.warn(`공고 ${wantedId} 처리 오류: ${err.message}`);
        failed++;
      }

      await this.sleep(1000);
    }

    const remaining = await this.prisma.job.count({
      where: { source: 'wanted', detailFetched: false },
    });

    this.logger.log(`상세 수집 배치 완료 - 성공 ${processed}, 실패 ${failed}, 남은 공고 ${remaining}`);
    return { processed, failed, remaining };
  }

  async scrapeSaramin(maxPage = 9999) {
    let saved = 0;
    let skipped = 0;
    let total = 0;

    for (let page = 1; page <= maxPage; page++) {
      const url = `https://www.saramin.co.kr/zf_user/jobs/list/job-category?cat_mcls=2&page=${page}`;

      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!res.ok) {
        this.logger.warn(`사람인 ${page}페이지 실패: ${res.status}`);
        break;
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      const items = $('.box_item');

      if (items.length === 0) break;

      for (const el of items.toArray()) {
        const title = $(el).find('.notification_info .job_tit .str_tit').text().trim();
        const company = $(el).find('.company_nm .str_tit').first().text().trim();
        const place = $(el).find('.work_place').text().trim();
        const career = $(el).find('.career').text().trim();
        const link = $(el).find('.job_tit .str_tit').attr('href');
        const recIdx = link?.match(/rec_idx=(\d+)/)?.[1];

        if (!recIdx || !title) continue;

        total++;
        const sourceUrl = `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${recIdx}`;
        const rawText = `${title} / ${company} / ${career}`;
        const hash = createHash('sha256').update(rawText).digest('hex');

        const exists = await this.prisma.job.findUnique({
          where: { contentHash: hash },
        });
        if (exists) {
          skipped++;
          continue;
        }

        await this.prisma.job.create({
          data: {
            source: 'saramin',
            sourceUrl,
            title,
            company: company || '미상',
            location: place || null,
            contentHash: hash,
            rawText,
          },
        });
        saved++;
      }

      this.logger.log(`사람인 ${page}페이지 완료 (누적 신규 ${saved}, 중복 ${skipped})`);
      await this.sleep(1);
    }

    this.logger.log(`사람인 수집 완료 - 전체 ${total}, 신규 ${saved}, 중복 ${skipped}`);
    return { total, saved, skipped };
  }

  async scrapeSaraminDetails(batchSize = 100) {
    const targets = await this.prisma.job.findMany({
      where: { source: 'saramin', detailFetched: false },
      take: batchSize,
    });

    if (targets.length === 0) {
      this.logger.log('사람인 상세 수집할 공고 없음 (전부 완료)');
      return { processed: 0, failed: 0, remaining: 0 };
    }

    let processed = 0;
    let failed = 0;

    for (const job of targets) {
      const recIdx = job.sourceUrl.match(/rec_idx=(\d+)/)?.[1];
      if (!recIdx) {
        failed++;
        continue;
      }

      const url = `https://www.saramin.co.kr/zf_user/jobs/relay/view-detail?rec_idx=${recIdx}&rec_seq=0`;

      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        if (!res.ok) {
          this.logger.warn(`사람인 ${recIdx} 상세 실패: ${res.status}`);
          failed++;
          await this.sleep(1);
          continue;
        }

        const html = await res.text();
        const $ = cheerio.load(html);
        const content = $('.user_content').text().trim() || $('.wrap_jv_cont').text().trim();

        await this.prisma.job.update({
          where: { id: job.id },
          data: {
            rawText: content || job.rawText,
            detailFetched: true,
          },
        });

        processed++;
        if (processed % 20 === 0) {
          this.logger.log(`사람인 상세 진행 중... ${processed}건`);
        }
      } catch (err) {
        this.logger.warn(`사람인 ${recIdx} 처리 오류: ${err.message}`);
        failed++;
      }

      await this.sleep(1);
    }

    const remaining = await this.prisma.job.count({
      where: { source: 'saramin', detailFetched: false },
    });

    this.logger.log(`사람인 상세 배치 완료 - 성공 ${processed}, 실패 ${failed}, 남은 ${remaining}`);
    return { processed, failed, remaining };
  }

  async scrapeJobkorea(maxPage = 9999) {
    const dutyCodes =
      '1000229,1000230,1000231,1000232,1000233,1000234,1000235,1000236,1000237,1000238,1000239,1000240,1000241,1000242,1000243,1000244,1000245,1000246,1000247,1000417,1000418,1000419,1000420,1000421,1000422,1000423';

    let saved = 0;
    let skipped = 0;
    let total = 0;

    for (let page = 1; page <= maxPage; page++) {
      const body = new URLSearchParams({
        isDefault: 'false',
        'condition[duty]': dutyCodes,
        'condition[menucode]': '',
        page: String(page),
        direct: '0',
        order: '20',
        pagesize: '40',
        tabindex: '0',
        onePick: '0',
        confirm: '0',
        profile: '0',
      });

      const res = await fetch('https://www.jobkorea.co.kr/Recruit/Home/_GI_List/', {
        method: 'POST',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: 'https://www.jobkorea.co.kr/recruit/joblist?menucode=duty',
        },
        body: body.toString(),
      });

      if (!res.ok) {
        this.logger.warn(`잡코리아 ${page}페이지 실패: ${res.status}`);
        break;
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      const rows = $('tr.devloopArea');

      if (rows.length === 0) break;

      const regionPattern =
        /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s?([가-힣]+(시|군|구))/;

      for (const el of rows.toArray()) {
        const titleEl = $(el).find('td.tplTit .titBx strong a[href*="GI_Read"]');
        const title = titleEl.text().trim();
        const href = titleEl.attr('href') || '';
        const id = href.match(/GI_Read\/(\d+)/)?.[1];
        if (!id || !title) continue;

        const company = $(el).find('td.tplCo a').first().text().trim();

        let location: string | null = null;
        let region: string | null = null;
        $(el).find('td.tplTit p.etc .cell').each((i, cell) => {
          if (location) return;
          const t = $(cell).text().trim();

          const m = t.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s?([가-힣]+(시|군|구))/);
          if (m) { region = m[1]; location = `${m[1]} ${m[2]}`; return; }

          const m2 = t.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s?전지역/);
          if (m2) { region = m2[1]; location = `${m2[1]} 전지역`; return; }

          if (/전국/.test(t)) { region = '전국'; location = '전국'; return; }

          if (/일본|중국|미국|베트남|싱가포르|인도|유럽|해외|아시아/.test(t)) {
            region = t.split(/\s+/)[0]; location = t; return;
          }
        });

        total++;
        const sourceUrl = `https://www.jobkorea.co.kr/Recruit/GI_Read/${id}`;
        const rawText = title;
        const hash = createHash('sha256').update(`jobkorea-${id}`).digest('hex');

        const exists = await this.prisma.job.findUnique({
          where: { contentHash: hash },
        });

        if (exists) {
          await this.prisma.job.update({
            where: { id: exists.id },
            data: {
              company: company || exists.company,
              location: location ?? exists.location,
              region: region ?? exists.region,
            },
          });
          skipped++;
          continue;
        }

        await this.prisma.job.create({
          data: {
            source: 'jobkorea',
            sourceUrl,
            title,
            company: company || '미상',
            location,
            region,
            contentHash: hash,
            rawText,
          },
        });
        saved++;
      }

      this.logger.log(`잡코리아 ${page}페이지 완료 (누적 신규 ${saved}, 중복 ${skipped})`);
      await this.sleep(1500);
    }

    this.logger.log(`잡코리아 수집 완료 - 전체 ${total}, 신규 ${saved}, 중복 ${skipped}`);
    return { total, saved, skipped };
  }

  async scrapeJobkoreaDetails(batchSize = 100) {
    const targets = await this.prisma.job.findMany({
      where: { source: 'jobkorea', detailFetched: false },
      take: batchSize,
    });

    if (targets.length === 0) {
      this.logger.log('잡코리아 상세 수집할 공고 없음 (전부 완료)');
      return { processed: 0, failed: 0, remaining: 0 };
    }

    let processed = 0;
    let failed = 0;
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    for (const job of targets) {
      const id = job.sourceUrl.match(/GI_Read\/(\d+)/)?.[1];
      if (!id) {
        failed++;
        continue;
      }

      try {
        const res1 = await fetch(`https://www.jobkorea.co.kr/Recruit/GI_Read/${id}`, {
          headers: { 'User-Agent': ua },
        });
        let company = job.company;
        if (res1.ok) {
          const $1 = cheerio.load(await res1.text());
          const c = $1('h2').first().text().trim();
          if (c) company = c;
        }

        const res2 = await fetch(`https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=${id}&isHiringCenter=false&hideMapView=false`, {
          headers: { 'User-Agent': ua },
        });

        let body = '';
        if (res2.ok) {
          const $2 = cheerio.load(await res2.text());
          $2('script, style, noscript').remove();
          body = $2('body').text().replace(/\s+/g, ' ').trim();
        }

        await this.prisma.job.update({
          where: { id: job.id },
          data: {
            company,
            rawText: body.length > 100 ? body : job.rawText,
            detailFetched: true,
          },
        });

        processed++;
        if (processed % 20 === 0) {
          this.logger.log(`잡코리아 상세 진행 중... ${processed}건`);
        }
      } catch (err) {
        this.logger.warn(`잡코리아 ${id} 오류: ${err.message}`);
        failed++;
      }

      await this.sleep(1200);
    }

    const remaining = await this.prisma.job.count({
      where: { source: 'jobkorea', detailFetched: false },
    });

    this.logger.log(`잡코리아 상세 배치 완료 - 성공 ${processed}, 실패 ${failed}, 남은 ${remaining}`);
    return { processed, failed, remaining };
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}