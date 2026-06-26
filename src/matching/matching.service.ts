import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EmbeddingService } from '../embedding/embedding.service';
import OpenAI from 'openai';
import { RedisService } from '../redis/redis.service';
import { createHash } from 'crypto';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

@Injectable()
export class MatchingService {
    private readonly openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    constructor(
        private prisma: PrismaService,
        private embedding: EmbeddingService,
        private redis: RedisService,
        private breaker: CircuitBreakerService,
    ) { }

    async match(params: {
        text: string;
        region?: string;
        userCareer?: number;        // (사용자) 경력 연차
        employmentType?: string;    // (사용자) 희망 고용형태
        limit?: number;
        since?: Date;
    }) {
        const limit = params.limit ?? 20;

        const [vec] = await this.embedding.embedQuery(params.text);
        const vecStr = `[${vec.join(',')}]`;

        const since = params.since ?? null;
        const region = params.region ?? null;
        const query = params.text;
        const userCareer = params.userCareer ?? null;
        const empType = params.employmentType ?? null;

        // 임베딩 유사도(0.7) + trigram 유사도(0.3) + 경력 가중치 + 고용형태 가중치
        const rows = await this.prisma.$queryRaw`
      SELECT id, title, company, location, region, source, "sourceUrl",
             "mainTasks", "requirements", "preferredPoints",
             "careerMin", "employmentType",
             1 - (embedding <=> ${vecStr}::vector) AS embed_score,
             GREATEST(word_similarity(title, ${query}), word_similarity(company, ${query})) AS trgm_score,
             CASE
               WHEN ${userCareer}::int IS NULL OR "careerMin" IS NULL THEN 0
               WHEN ${userCareer}::int >= "careerMin" THEN 0.1
               WHEN ${userCareer}::int >= "careerMin" - 1 THEN 0.05
               ELSE -0.05
             END AS career_score,
             CASE
               WHEN ${empType}::text IS NULL OR "employmentType" IS NULL THEN 0
               WHEN "employmentType" = ${empType}::text THEN 0.1
               ELSE 0
             END AS emp_score,
             (0.7 * (1 - (embedding <=> ${vecStr}::vector))
              + 0.3 * GREATEST(word_similarity(title, ${query}), word_similarity(company, ${query}))
              + CASE
                  WHEN ${userCareer}::int IS NULL OR "careerMin" IS NULL THEN 0
                  WHEN ${userCareer}::int >= "careerMin" THEN 0.1
                  WHEN ${userCareer}::int >= "careerMin" - 1 THEN 0.05
                  ELSE -0.05
                END
              + CASE
                  WHEN ${empType}::text IS NULL OR "employmentType" IS NULL THEN 0
                  WHEN "employmentType" = ${empType}::text THEN 0.1
                  ELSE 0
                END
             ) AS score
      FROM "Job"
      WHERE "duplicateOf" IS NULL
        AND embedding IS NOT NULL
        AND "isIT" = true
        AND (${region}::text IS NULL OR region = ${region})
        AND (${since}::timestamp IS NULL OR "createdAt" > ${since})
      ORDER BY score DESC
      LIMIT ${limit}
    `;

        const rawRows = rows as any[];

        const TOP = 10;
        const topRows = rawRows.slice(0, TOP);
        const reasons = await Promise.all(
            topRows.map((job) => this.generateReason(params.text, job)),
        );

        const slim = (job: any) => ({
            id: job.id,
            title: job.title,
            company: job.company,
            location: job.location,
            region: job.region,
            source: job.source,
            sourceUrl: job.sourceUrl,
            careerMin: job.careerMin,
            employmentType: job.employmentType,
            score: job.score,
            embedScore: job.embed_score,
            trgmScore: job.trgm_score,
            careerScore: job.career_score,
            empScore: job.emp_score,
        });

        const recommended = topRows.map((job, i) => ({
            ...slim(job),
            reason: reasons[i],
        }));

        const moreCandidates = rawRows.slice(TOP).map(slim);

        return {
            total: rawRows.length,
            recommended,
            moreCandidates,
        };
    }

    async matchByConditions(params: {
        jobCategory?: string;
        skills?: string[];
        career?: string;
        employmentType?: string;
        region?: string;
        limit?: number;
    }) {
        const parts: string[] = [];
        if (params.jobCategory) parts.push(`${params.jobCategory} 개발자`);
        if (params.skills?.length) parts.push(`${params.skills.join(', ')} 사용`);
        if (params.career) parts.push(`경력 ${params.career}`);

        const text = parts.join('. ');

        // 숫자만 뽑기
        let userCareer: number | undefined;
        if (params.career) {
            if (/신입|무관/.test(params.career)) userCareer = 0;
            else {
                const m = params.career.match(/(\d+)/);
                if (m) userCareer = parseInt(m[1], 10);
            }
        }

        return this.match({
            text,
            region: params.region,
            userCareer,
            employmentType: params.employmentType,
            limit: params.limit,
        });
    }

    private async generateReason(resume: string, job: any) {
        const key = `reason:${createHash('sha256').update(resume).digest('hex')}:${job.id}`;
        const cached = await this.redis.get<any>(key);
        if (cached) {
            return cached;
        }

        const jobText = [
            `제목: ${job.title}`,
            `회사: ${job.company}`,
            job.location ? `근무지: ${job.location}` : '',
            job.mainTasks ? `주요업무: ${job.mainTasks}` : '',
            job.requirements ? `자격요건: ${job.requirements}` : '',
            job.preferredPoints ? `우대사항: ${job.preferredPoints}` : '',
        ].filter(Boolean).join('\n');

        const system = `너는 IT 취업 매칭 서비스의 분석 어시스턴트야
지원자 정보와 채용공고를 대조해서 이 공고가 왜 지원자에게 맞는지 근거를 뽑아내는 게 너의 역할이야

네가 하는 일
- 지원자의 기술 스택,경력,지향점과 공고의 요구사항을 하나씩 맞춰보고 실제로 겹치는 지점을 찾아
- 너는 합격 가능성을 점수로 매기거나 지원 여부를 결정하지 않아. 너는 왜 이 공고가 떴는지를 설명하는 역할이야

어떻게 분석하는지 (순서대로)
1. 공고가 요구하는 핵심 기술,경력 수준을 먼저 파악해
2. 지원자 정보에서 그와 겹치는 부분을 찾아 (기술명이 정확히 같지 않아도 같은 계열이면 가능. 예시로 Express ↔ Nest.js는 같은 Node 생태계야)
3. 공고가 요구하는데 지원자 정보에 안 드러난 부분을 찾아
4. 위를 바탕으로 근거를 정리해

규칙
- 근거는 반드시 지원자 정보와 공고에 실제로 적힌 내용에서만 가져와. 둘 중 어디에도 없는 내용을 지어내지 마
- 기술 매칭은 구체적으로 적어. 그냥 "기술이 맞음"이 아니라 "지원자의 Node.js 경험이 공고의 백엔드 요건과 맞음"처럼 무엇과 무엇이 맞는지 명시해
- 경력 연차가 공고 요구와 차이 나면 confirm에 적어 (예시로 공고는 5년 이상인데 지원자는 3년차)
- 정보가 부족해서 판단 못 하면 단정하지 말고 그 사실을 그대로 적어
- 광고처럼 띄우지 말고 사실만 담백하게 적어
- 출력(summary, matches, confirm)은 사용자에게 보여주는 내용이니 존댓말로 써. 지원자를 존중하는 톤으로

출력 형식
아래 JSON으로만 답해. 다른 말 붙이지 마
{
  "summary": "이 공고를 추천하는 핵심 이유 (2문장, 존댓말)",
  "matches": ["겹치는 지점을 구체적으로 설명 (무엇↔무엇이 맞고, 그게 왜 의미 있는지까지)"],
  "confirm": ["확인하거나 보완하면 좋을 점과, 그 이유"]
}
- matches는 2~4개, confirm은 1~2개
- 각 항목은 단답이 아니라 2문장 정도로 풀어서 지원자가 납득할 수 있게 설명해

예시
입력: 지원자 "3년차 백엔드, Node.js/Express, AWS 배포 경험" / 공고 "Nest.js 백엔드 5년 이상, AWS 환경"
출력:
{
  "summary": "지원자님의 Node.js 백엔드 경험과 AWS 운영 경험이 이 공고의 핵심 요건과 직접 맞닿아 있습니다. 같은 기술 생태계에서 쌓은 경험이라 적응 부담이 적을 것으로 보입니다.",
  "matches": ["지원자님이 사용해 온 Express는 이 공고가 요구하는 Nest.js와 같은 Node.js 생태계라, 프레임워크 전환에 드는 학습 비용이 크지 않습니다.", "AWS에 직접 배포해 본 경험이 있어, 공고에서 요구하는 AWS 환경에서의 운영 업무에 바로 투입되기 수월합니다."],
  "confirm": ["이 공고는 5년 이상 경력을 요구하는데 지원자님은 3년차이므로, 요구 연차와의 차이를 지원 전에 확인해 보시는 것이 좋습니다."]
}`;

        const res = await this.breaker.fire('openai', () =>
            this.openai.chat.completions.create({
                model: 'gpt-5-mini',
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: `[지원자 정보]\n${resume}\n\n[채용공고]\n${jobText}` },
                ],
            }),
        );

        let parsed: any;
        try {
            parsed = JSON.parse(res.choices[0].message.content ?? '{}');
        } catch {
            return { summary: '', matches: [], confirm: [] };
        }

        await this.redis.set(key, parsed, 60 * 60 * 24);
        return parsed;
    }
}