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
}