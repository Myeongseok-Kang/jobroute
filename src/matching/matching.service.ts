import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EmbeddingService } from '../embedding/embedding.service';

@Injectable()
export class MatchingService {
    constructor(
        private prisma: PrismaService,
        private embedding: EmbeddingService,
    ) { }

    async match(params: {
        text: string;
        region?: string;
        limit?: number;
    }) {
        const limit = params.limit ?? 20;

        const [vec] = await this.embedding.embedQuery(params.text);
        const vecStr = `[${vec.join(',')}]`;

        // isIT 필터 + 지역 필터 + 유사도 상위 N개
        const region = params.region ?? null;
        const rows = await this.prisma.$queryRaw`
      SELECT id, title, company, location, region, source, "sourceUrl",
             1 - (embedding <=> ${vecStr}::vector) AS score
      FROM "Job"
      WHERE "duplicateOf" IS NULL
        AND embedding IS NOT NULL
        AND "isIT" = true
        AND (${region}::text IS NULL OR region = ${region})
      ORDER BY embedding <=> ${vecStr}::vector
      LIMIT ${limit}
    `;

        return { count: (rows as any[]).length, matches: rows };
    }
}