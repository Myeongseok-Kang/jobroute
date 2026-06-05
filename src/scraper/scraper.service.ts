import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { createHash } from 'crypto';

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
}