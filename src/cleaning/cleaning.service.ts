import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class CleaningService {
    private readonly logger = new Logger(CleaningService.name);

    constructor(private prisma: PrismaService) { }

    // 본문 품질 플래그
    async flagBodyQuality() {
        const withBody = await this.prisma.job.updateMany({
            where: { rawText: { not: '' } },
            data: {},
        });

        const hasBodyResult = await this.prisma.$executeRaw`
      UPDATE "Job" SET "hasBody" = (LENGTH("rawText") > 100)
    `;

        const trueCount = await this.prisma.job.count({ where: { hasBody: true } });
        const falseCount = await this.prisma.job.count({ where: { hasBody: false } });

        this.logger.log(`본문 품질 플래그 완료 - hasBody true: ${trueCount}, false: ${falseCount}`);
        return { hasBodyTrue: trueCount, hasBodyFalse: falseCount };
    }

    async standardizeLocation() {
        // "외" 제거 + region(광역) 추출
        await this.prisma.$executeRaw`
      UPDATE "Job"
      SET location = TRIM(REGEXP_REPLACE(location, '\\s*외\\s*$', ''))
      WHERE location LIKE '%외'
    `;

        // region = location의 첫 단어 (서울/경기/인천...)
        await this.prisma.$executeRaw`
      UPDATE "Job"
      SET region = SPLIT_PART(location, ' ', 1)
      WHERE location IS NOT NULL AND location != ''
    `;

        await this.prisma.$executeRaw`
      UPDATE "Job"
      SET region = REGEXP_REPLACE(region, '전체$', '')
      WHERE region LIKE '%전체'
    `;
        // "~전체" → 광역명으로 통합 (서울전체 → 서울)
        const regions = await this.prisma.job.groupBy({
            by: ['region'],
            _count: true,
            orderBy: { _count: { region: 'desc' } },
        });

        this.logger.log(`위치 표준화 완료 - region 종류: ${regions.length}`);
        return regions.map((r) => ({ region: r.region, count: r._count }));
    }
}