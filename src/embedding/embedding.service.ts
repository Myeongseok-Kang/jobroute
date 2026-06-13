import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { VoyageAIClient } from 'voyageai';
import { buildEmbeddingText } from './build-embedding-text';

@Injectable()
export class EmbeddingService {
    private readonly logger = new Logger(EmbeddingService.name);
    private readonly voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });

    constructor(private prisma: PrismaService) { }

    private async embedDocuments(texts: string[], retries = 5): Promise<number[][]> {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const res = await this.voyage.embed({
                    model: 'voyage-4-large',
                    input: texts,
                    inputType: 'document',
                    outputDimension: 1024,
                });
                return res.data!.map((d) => d.embedding!);
            } catch (e: any) {
                const status = e?.statusCode ?? e?.status;
                if (status === 429 && attempt < retries) {
                    const wait = 2 ** attempt * 1000;
                    this.logger.warn(`429, ${wait}ms 대기 후 재시도 (${attempt + 1})`);
                    await new Promise((r) => setTimeout(r, wait));
                    continue;
                }
                throw e;
            }
        }
        throw new Error('재시도 초과');
    }

    // 검증용 대표 공고 10개만
    async embedSample(take = 10) {
        const jobs = await this.prisma.job.findMany({
            where: { duplicateOf: null, hasBody: true },
            select: {
                id: true, title: true, company: true,
                mainTasks: true, requirements: true, preferredPoints: true, rawText: true,
            },
            take,
        });
        this.logger.log(`${jobs.length}개 임베딩 시작`);

        const texts = jobs.map(buildEmbeddingText);
        const vectors = await this.embedDocuments(texts);
        this.logger.log(`임베딩 완료: ${vectors.length}개, 각 ${vectors[0].length}차원`);

        for (let i = 0; i < jobs.length; i++) {
            const vec = `[${vectors[i].join(',')}]`;
            await this.prisma.$executeRaw`
        UPDATE "Job" SET embedding = ${vec}::vector WHERE id = ${jobs[i].id}
      `;
        }
        this.logger.log('DB 저장 완료');

        const check = await this.prisma.$queryRaw<{ id: string; dim: number }[]>`
      SELECT id, vector_dims(embedding) AS dim FROM "Job" WHERE id = ${jobs[0].id}
    `;
        this.logger.log(`저장 확인: ${JSON.stringify(check)}`);
        return check;
    }
}