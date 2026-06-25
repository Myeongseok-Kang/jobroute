import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { createHash } from 'crypto';
import * as cheerio from 'cheerio';
import { VoyageAIClient } from 'voyageai';
import OpenAI from 'openai';
import { NotFoundException } from '@nestjs/common';

@Injectable()
export class CoverLetterService {
    private readonly logger = new Logger(CoverLetterService.name);
    private readonly voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });
    private readonly openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    private readonly ua =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    constructor(private prisma: PrismaService) { }

    async scrapeCoverLetters(maxPage = 5) {
        let saved = 0;
        let skipped = 0;
        let total = 0;

        for (let page = 1; page <= maxPage; page++) {
            const listUrl = `https://www.jobkorea.co.kr/starter/PassAssay?schPart=10031&isSaved=1&isFilterChecked=1&OrderBy=0&Page=${page}`;

            const res = await fetch(listUrl, { headers: { 'User-Agent': this.ua } });
            if (!res.ok) {
                this.logger.warn(`목록 ${page}페이지 실패: ${res.status}`);
                break;
            }

            const $ = cheerio.load(await res.text());

            // 링크 + 직무 추출
            const items: { id: string; jobCategory: string | null }[] = [];
            const seen = new Set<string>();

            $('a[href*="/PassAssay/View/"]').each((i, el) => {
                const href = $(el).attr('href') || '';
                const id = href.match(/View\/(\d+)/)?.[1];
                if (!id || seen.has(id)) return;

                const linkText = $(el).text();
                const parentText = $(el).parent().text();
                const jobCategory = this.extractJob(linkText) || this.extractJob(parentText);

                seen.add(id);
                items.push({ id, jobCategory });
            });

            if (items.length === 0) {
                this.logger.log(`${page}페이지 항목 없음 - 종료`);
                break;
            }

            this.logger.log(`목록 ${page}페이지 - ${items.length}개 자소서 발견`);

            for (const item of items) {
                total++;
                const result = await this.scrapeOne(item.id, item.jobCategory);
                if (result === 'saved') saved++;
                else if (result === 'skipped') skipped++;
                await this.sleep(150);
            }

            await this.sleep(200);
        }

        this.logger.log(`자소서 수집 완료 - 전체 ${total}, 신규 ${saved}, 중복 ${skipped}`);
        return { total, saved, skipped };
    }

    private async scrapeOne(
        id: string,
        jobCategory: string | null,
    ): Promise<'saved' | 'skipped' | 'failed'> {
        const url = `https://www.jobkorea.co.kr/starter/PassAssay/View/${id}`;

        try {
            const res = await fetch(url, { headers: { 'User-Agent': this.ua } });
            if (!res.ok) return 'failed';

            const $ = cheerio.load(await res.text());

            // 회사명
            const company = $('.tit .co a, .titBx h2 a, h2 a').first().text().trim();

            // 재시도
            let job = jobCategory;
            if (!job) {
                const headerText = $('.tit, .titBx, .starBx, h2').first().text();
                job = this.extractJob(headerText);
            }

            // 본문 추출
            const parts: string[] = [];
            $('.qnaLists dt, .qnaLists dd, .questBox, .answerBox, dt, dd').each((i, el) => {
                const t = $(el).text().replace(/\s+/g, ' ').trim();
                const cleaned = t
                    .replace(/글자수\s*[\d,]+\s*자\s*[\d,]+\s*Byte/g, '')
                    .replace(/보기$/, '')
                    .trim();
                if (cleaned.length > 10) parts.push(cleaned);
            });

            const content = parts.join('\n\n').trim();

            if (content.length < 100) {
                this.logger.warn(`자소서 ${id} 본문 너무 짧음 (${content.length}자)`);
                return 'failed';
            }

            const hash = createHash('sha256').update(`coverletter-${id}`).digest('hex');
            const exists = await this.prisma.coverLetterSample.findUnique({
                where: { contentHash: hash },
            });
            if (exists) return 'skipped';

            await this.prisma.coverLetterSample.create({
                data: {
                    source: 'jobkorea',
                    sourceUrl: url,
                    company: company || null,
                    jobCategory: job || null,
                    content,
                    contentHash: hash,
                },
            });
            return 'saved';
        } catch (err: any) {
            this.logger.warn(`자소서 ${id} 처리 오류: ${err.message}`);
            return 'failed';
        }
    }

    async embedAll() {
        const start = Date.now();

        const targets = await this.prisma.$queryRaw<{ id: string; content: string }[]>`
      SELECT id, content FROM "CoverLetterSample" WHERE embedding IS NULL
    `;

        if (targets.length === 0) {
            this.logger.log('임베딩할 자소서 없음 (전부 완료)');
            return { total: 0, embedded: 0 };
        }

        this.logger.log(`자소서 임베딩 시작 - ${targets.length}건`);

        const BATCH = 30;
        let processed = 0;
        for (let i = 0; i < targets.length; i += BATCH) {
            const batch = targets.slice(i, i + BATCH);
            const vectors = await this.embedDocuments(batch.map((b) => b.content));

            for (let j = 0; j < batch.length; j++) {
                const vec = `[${vectors[j].join(',')}]`;
                await this.prisma.$executeRaw`
          UPDATE "CoverLetterSample" SET embedding = ${vec}::vector WHERE id = ${batch[j].id}
        `;
            }

            processed += batch.length;
            this.logger.log(`${processed}/${targets.length}`);
        }

        const sec = ((Date.now() - start) / 1000).toFixed(1);
        this.logger.log(`자소서 임베딩 완료 - ${processed}건, ${sec}초`);
        return { total: targets.length, embedded: processed, seconds: sec };
    }

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

    private async embedQuery(text: string, retries = 5): Promise<number[]> {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const res = await this.voyage.embed({
                    model: 'voyage-4-large',
                    input: [text],
                    inputType: 'query',
                    outputDimension: 1024,
                });
                return res.data![0].embedding!;
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

    // 유사한 합격 자소서 검색
    async search(query: string, limit = 3, jobCategory?: string) {
        const vec = await this.embedQuery(query);
        const vecStr = `[${vec.join(',')}]`;

        // 같은 직무 우선
        if (jobCategory) {
            const filtered = await this.prisma.$queryRaw<any[]>`
        SELECT id, company, "jobCategory", content,
               1 - (embedding <=> ${vecStr}::vector) AS score
        FROM "CoverLetterSample"
        WHERE embedding IS NOT NULL AND "jobCategory" = ${jobCategory}
        ORDER BY embedding <=> ${vecStr}::vector
        LIMIT ${limit}
      `;
            if (filtered.length >= limit) return filtered;
        }

        return this.prisma.$queryRaw<any[]>`
      SELECT id, company, "jobCategory", content,
             1 - (embedding <=> ${vecStr}::vector) AS score
      FROM "CoverLetterSample"
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vecStr}::vector
      LIMIT ${limit}
    `;
    }

    // 초안
    async draft(resumeText: string, jobId: string) {
        const job = await this.prisma.job.findFirst({
            where: { id: jobId, duplicateOf: null, isIT: true },
        });
        if (!job) throw new NotFoundException('공고를 찾을 수 없습니다');

        const jobText = [
            `제목: ${job.title}`,
            `회사: ${job.company}`,
            job.mainTasks ? `주요업무: ${job.mainTasks}` : '',
            job.requirements ? `자격요건: ${job.requirements}` : '',
            job.preferredPoints ? `우대사항: ${job.preferredPoints}` : '',
        ].filter(Boolean).join('\n');

        // RAG
        const samples = await this.search(`${jobText}\n${resumeText}`, 3);
        const sampleText = samples
            .map((s, i) => `[참고 합격자소서 ${i + 1}] (${s.company ?? ''} ${s.jobCategory ?? ''})\n${s.content.slice(0, 1500)}`)
            .join('\n\n---\n\n');

        const system = `너는 IT 취업 자기소개서 작성을 돕는 어시스턴트야
지원자의 이력서와 채용공고를 보고, 그 공고에 맞는 자기소개서 초안을 작성하는 게 너의 역할이야
함께 주어지는 합격자소서 예시들은 이런 식으로 쓰면 합격한다는 참고 자료야. 문체나 구성 흐름을 참고하되, 내용을 베끼지는 마

네가 하는 일
- 지원자 이력서에 실제로 있는 경험과 기술만으로 자소서를 써. 이력서에 없는 경험을 지어내지 마
- 공고의 요구사항, 우대사항과 지원자 경험이 겹치는 지점을 찾아서 부각해
- 합격자소서 예시의 좋은 점(구체적 사례 제시 방식, 문제-해결-성과 구조)을 참고해

작성 규칙
- 지어내기 절대 금지, 예시를 주자면 이력서에 "Node.js 3년"만 있으면 "5년"이나 "팀 리드 경험" 같은 걸 만들지 마
- 직무역량 항목은 "문제 상황 -> 해결 과정 -> 성과" 구조로 구체적으로
- 지원동기는 회사/직무와 지원자 경험의 접점을 근거로
- 추상적(열정, 최선) 대신 구체적 경험으로
- 존댓말로, 실제 제출 가능한 수준의 완성도로

출력 형식
아래 JSON으로만 답해. 다른 말 붙이지 마
{
  "지원동기": "...",
  "직무역량": "...",
  "입사후포부": "..."
}
- 각 항목 300~500자 정도

문체 규칙 (반드시 지켜줘)
다음 표현은 절대 쓰지 마: 단순한, 단순히, 이러한, 이를, 이는, 결론적으로, 시사, 통찰, 효과적이다, 빼놓을 수 없다, 보인다, 이처럼, 이에 반해, 마지막으로, 자신
첫째 둘째 셋째 같은 서수사를 쓰지 마
한글 뒤에 괄호로 영어를 병기하지 마 (예: 경제(economy) 금지). 단 Node.js, PostgreSQL 같은 기술 스택 이름은 그대로 써
문장 안에서 강조하려고 따옴표로 단어를 감싸지 마
가운뎃점(· 또는 ‧)을 쓰지 마. 나열할 땐 쉼표나 "와/과"로 연결해
AI가 쓴 듯한 정형화된 문투를 피하고 사람이 직접 쓴 것처럼 구체적 경험과 사실 위주로 담백하게 써`;

        const userContent = `[지원자 이력서]\n${resumeText}\n\n[채용공고]\n${jobText}\n\n[참고할 합격자소서 예시]\n${sampleText}`;

        const res = await this.openai.chat.completions.create({
            model: 'gpt-5-mini',
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: userContent },
            ],
        });

        let parsed: any;
        try {
            parsed = JSON.parse(res.choices[0].message.content ?? '{}');
        } catch {
            parsed = { 지원동기: '', 직무역량: '', 입사후포부: '' };
        }

        return { draft: parsed, referencedSamples: samples.map((s) => ({ company: s.company, jobCategory: s.jobCategory, score: s.score })) };
    }

    //  첨삭
    async review(userCoverLetter: string) {
        // RAG
        const samples = await this.search(userCoverLetter, 3);
        const sampleText = samples
            .map((s, i) => `[합격자소서 ${i + 1}] (${s.company ?? ''} ${s.jobCategory ?? ''})\n${s.content.slice(0, 1500)}`)
            .join('\n\n---\n\n');

        const system = `너는 IT 취업 자기소개서를 첨삭하는 어시스턴트야
지원자가 쓴 자소서를 보고, 더 좋게 만들 수 있도록 피드백하는 게 너의 역할이야
함께 주어지는 합격자소서 예시들은 합격한 자소서는 이렇게 썼다는 기준이야. 이 기준에 비춰서 지원자 자소서를 평가해

네가 하는 일
- 지원자 자소서의 좋은 점을 먼저 짚어줘
- 합격자소서 예시와 비교해서 부족한 점(구체성 부족, 추상적 표현, 성과 누락 등)을 찾아
- 어떻게 고치면 좋을지 구체적인 방향을 제시해

피드백 규칙
- 막연한 칭찬이나 비난 대신 구체적으로. "좋아요"가 아니라 "OO 경험을 수치와 함께 제시한 점이 좋습니다"
- 합격자소서 예시를 근거로 "합격자들은 이렇게 썼다"는 식으로 비교
- 비난조 아니라 개선을 돕는 톤으로
- 지원자가 쓴 내용을 존중하면서 발전 방향 제시

출력 형식
아래 JSON으로만 답해. 다른 말 붙이지 마
{
  "강점": ["잘 쓴 점 (구체적으로)"],
  "개선점": ["부족한 점과 어떻게 고칠지"],
  "총평": "전체적인 방향 제시 (2~3문장)"
}
- 강점 2~3개, 개선점 2~4개

문체 규칙 (반드시 지켜줘)
다음 표현은 절대 쓰지 마: 단순한, 단순히, 이러한, 이를, 이는, 결론적으로, 시사, 통찰, 효과적이다, 빼놓을 수 없다, 보인다, 이처럼, 이에 반해, 마지막으로, 자신
첫째 둘째 셋째 같은 서수사를 쓰지 마
한글 뒤에 괄호로 영어를 병기하지 마 (예: 경제(economy) 금지). 단 Node.js, PostgreSQL 같은 기술 스택 이름은 그대로 써
문장 안에서 강조하려고 따옴표로 단어를 감싸지 마
가운뎃점(· 또는 ‧)을 쓰지 마. 나열할 땐 쉼표나 "와/과"로 연결해
AI가 쓴 듯한 정형화된 문투를 피하고 사람이 직접 쓴 것처럼 구체적 경험과 사실 위주로 담백하게 써`;

        const userContent = `[지원자가 쓴 자소서]\n${userCoverLetter}\n\n[참고할 합격자소서 예시]\n${sampleText}`;

        const res = await this.openai.chat.completions.create({
            model: 'gpt-5-mini',
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: userContent },
            ],
        });

        let parsed: any;
        try {
            parsed = JSON.parse(res.choices[0].message.content ?? '{}');
        } catch {
            parsed = { 강점: [], 개선점: [], 총평: '' };
        }

        return { review: parsed, referencedSamples: samples.map((s) => ({ company: s.company, jobCategory: s.jobCategory, score: s.score })) };
    }

    private extractJob(text: string): string | null {
        const jobs = [
            '백엔드개발자', '프론트엔드개발자', '웹개발자', '앱개발자',
            '소프트웨어개발자', '데이터엔지니어', '데이터사이언티스트',
            '시스템엔지니어', '네트워크엔지니어', 'DBA', '보안엔지니어',
            '게임개발자', 'AI/ML엔지니어', '클라우드엔지니어', 'QA',
            '데이터분석가', 'AI/ML연구원',
        ];
        for (const j of jobs) {
            if (text.includes(j)) return j;
        }
        return null;
    }

    private sleep(ms: number) {
        return new Promise((r) => setTimeout(r, ms));
    }
}