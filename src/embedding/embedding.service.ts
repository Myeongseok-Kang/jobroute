import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { VoyageAIClient } from 'voyageai';
import { buildEmbeddingText } from './build-embedding-text';
import { createHash } from 'crypto';

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

    private hashText(text: string): string {
        return createHash('sha256').update(text).digest('hex');
    }

    async embedAll() {
        const start = Date.now();

        const jobs = await this.prisma.job.findMany({
            where: { duplicateOf: null, hasBody: true },
            select: {
                id: true, title: true, company: true,
                mainTasks: true, requirements: true, preferredPoints: true, rawText: true,
                embeddingHash: true,
            },
        });

        const todo: { id: string; text: string; hash: string }[] = [];
        let skipped = 0;
        for (const job of jobs) {
            const text = buildEmbeddingText(job);
            const hash = this.hashText(text);
            if (job.embeddingHash === hash) {
                skipped++;
                continue;
            }
            todo.push({ id: job.id, text, hash });
        }
        this.logger.log(`대상 ${jobs.length}건, 스킵 ${skipped}건, 임베딩 ${todo.length}건`);

        const BATCH = 30;
        let processed = 0;
        for (let i = 0; i < todo.length; i += BATCH) {
            const batch = todo.slice(i, i + BATCH);
            const vectors = await this.embedDocuments(batch.map((b) => b.text));

            for (let j = 0; j < batch.length; j++) {
                const vec = `[${vectors[j].join(',')}]`;
                await this.prisma.$executeRaw`
          UPDATE "Job"
          SET embedding = ${vec}::vector, "embeddingHash" = ${batch[j].hash}
          WHERE id = ${batch[j].id}
        `;
            }

            processed += batch.length;
            this.logger.log(`${processed}/${todo.length}`);
        }

        const sec = ((Date.now() - start) / 1000).toFixed(1);
        this.logger.log(`완료 - 임베딩 ${processed}건, 스킵 ${skipped}건, ${sec}초`);
        return { total: jobs.length, embedded: processed, skipped, seconds: sec };
    }

    async search(query: string, limit = 20) {
        const [vec] = await this.embedQuery(query);
        const vecStr = `[${vec.join(',')}]`;

        return this.prisma.$queryRaw`
      SELECT id, title, company, location, region, source,
             1 - (embedding <=> ${vecStr}::vector) AS score
      FROM "Job"
      WHERE "duplicateOf" IS NULL AND embedding IS NOT NULL AND "isIT" = true
      ORDER BY embedding <=> ${vecStr}::vector
      LIMIT ${limit}
    `;
    }

    async embedQuery(text: string, retries = 5): Promise<number[][]> {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const res = await this.voyage.embed({
                    model: 'voyage-4-large',
                    input: [text],
                    inputType: 'query',
                    outputDimension: 1024,
                });
                return res.data!.map((d) => d.embedding!);
            } catch (e: any) {
                const status = e?.statusCode ?? e?.status;
                if (status === 429 && attempt < retries) {
                    await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
                    continue;
                }
                throw e;
            }
        }
        throw new Error('재시도 초과');
    }

    private readonly IT_REFERENCE =
        '소프트웨어 개발자. 백엔드 프론트엔드 웹 모바일 앱 개발. 프로그래밍, API 서버, 데이터베이스, 클라우드 인프라, AI 머신러닝, 데이터 엔지니어링, DevOps, 보안. 코드 작성과 시스템 설계를 하는 IT 엔지니어.';

    
    async flagNonIT(threshold = 0.1) {
        const [refVec] = await this.embedQuery(this.IT_REFERENCE);
        const refStr = `[${refVec.join(',')}]`;

        const dist = await this.prisma.$queryRaw<{ bucket: number; cnt: bigint }[]>`
      SELECT FLOOR((1 - (embedding <=> ${refStr}::vector)) * 20) / 20 AS bucket,
             COUNT(*) AS cnt
      FROM "Job"
      WHERE "duplicateOf" IS NULL AND embedding IS NOT NULL
      GROUP BY bucket ORDER BY bucket
    `;
        this.logger.log(`분포: ${JSON.stringify(dist.map(d => ({ b: d.bucket, c: Number(d.cnt) })))}`);

        const affected = await this.prisma.$executeRaw`
      UPDATE "Job"
      SET "isIT" = (1 - (embedding <=> ${refStr}::vector)) >= ${threshold}
      WHERE embedding IS NOT NULL
    `;

        const nonItCount = await this.prisma.job.count({ where: { isIT: false, duplicateOf: null } });
        this.logger.log(`비IT ${nonItCount}건 (threshold ${threshold})`);
        return { nonIT: nonItCount, threshold };
    }

    // 디버깅용
    async debugSimilarity(opts: { min?: number; max?: number; dist?: boolean } = {}) {
        const [refVec] = await this.embedQuery(this.IT_REFERENCE);
        const refStr = `[${refVec.join(',')}]`;

        if (opts.dist) {
            const dist = await this.prisma.$queryRaw<{ bucket: number; cnt: bigint }[]>`
        SELECT FLOOR((1 - (embedding <=> ${refStr}::vector)) * 20) / 20 AS bucket, COUNT(*) AS cnt
        FROM "Job" WHERE "duplicateOf" IS NULL AND embedding IS NOT NULL
        GROUP BY bucket ORDER BY bucket
      `;
            return dist.map((d) => {
                const lo = Number(d.bucket);
                const hi = lo + 0.05;
                return {
                    구간: `${lo.toFixed(2)}~${hi.toFixed(2)}`,
                    공고수: Number(d.cnt),
                };
            });
        }

        const min = opts.min ?? 0;
        const max = opts.max ?? 1;
        return this.prisma.$queryRaw`
      SELECT title, company, source,
             ROUND((1 - (embedding <=> ${refStr}::vector))::numeric, 4) AS score
      FROM "Job"
      WHERE "duplicateOf" IS NULL AND embedding IS NOT NULL
        AND (1 - (embedding <=> ${refStr}::vector)) >= ${min}
        AND (1 - (embedding <=> ${refStr}::vector)) < ${max}
      ORDER BY score ASC
    `;
    }
}