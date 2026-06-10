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
      await this.sleep(1500);
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
          await this.sleep(1500);
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

      await this.sleep(1500);
    }

    const remaining = await this.prisma.job.count({
      where: { source: 'saramin', detailFetched: false },
    });

    this.logger.log(`사람인 상세 배치 완료 - 성공 ${processed}, 실패 ${failed}, 남은 ${remaining}`);
    return { processed, failed, remaining };
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}