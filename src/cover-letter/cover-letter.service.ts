import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { createHash } from 'crypto';
import * as cheerio from 'cheerio';
import { VoyageAIClient } from 'voyageai';

@Injectable()
export class CoverLetterService {
    private readonly logger = new Logger(CoverLetterService.name);
    private readonly voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });
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