import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Minhash, LshIndex } from 'minhash';

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

    private normalizeTokens(title: string, company: string): string[] {
        const text = `${title} ${company}`
            .toLowerCase()
            .replace(/\[.*?\]|\(.*?\)/g, ' ')
            .replace(/채용|모집|공고|구인|영입|신입|경력|정규직|계약직/g, ' ')
            .replace(/[^가-힣a-z0-9]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const compact = text.replace(/\s/g, '');
        const shingles: string[] = [];
        for (let i = 0; i < compact.length - 1; i++) {
            shingles.push(compact.slice(i, i + 2));
        }
        return shingles.length > 0 ? shingles : [compact];
    }

    private companyKey(company: string): string {
        return company
            .toLowerCase()
            .replace(/주식회사|㈜|\(주\)|\(유\)|inc|corp|ltd/g, '')
            .replace(/[^가-힣a-z0-9]/g, '')
            .trim();
    }

    async deduplicate(threshold = 0.7) {
        await this.prisma.$executeRaw`UPDATE "Job" SET "duplicateOf" = NULL`;

        const jobs = await this.prisma.job.findMany({
            select: { id: true, title: true, company: true },
            orderBy: { createdAt: 'asc' },
        });

        this.logger.log(`중복 검사 시작 - 대상 ${jobs.length}건`);

        // 각 공고 Minhash 생성 + LSH 인덱스 구축
        const index = new LshIndex();
        const minhashes = new Map<string, any>();
        const jobMap = new Map<string, { title: string; company: string }>();

        for (const job of jobs) {
            const m = new Minhash();
            this.normalizeTokens(job.title, job.company).forEach((s) => m.update(s));
            index.insert(job.id, m);
            minhashes.set(job.id, m);
            jobMap.set(job.id, { title: job.title, company: job.company });
        }

        // 각 공고마다 유사 후보 조회 → 대표 정하기
        const representativeOf = new Map<string, string>(); // 공고id -> 대표id
        let dupCount = 0;

        for (const job of jobs) {
            if (representativeOf.has(job.id)) continue;

            const candidates: string[] = index.query(minhashes.get(job.id));
            const myCompany = this.companyKey(job.company);

            for (const candId of candidates) {
                if (candId === job.id) continue;
                if (representativeOf.has(candId)) continue;

                // 회사명이 다르면 스킵
                const candCompany = this.companyKey(jobMap.get(candId)!.company);
                if (myCompany && candCompany && myCompany !== candCompany) continue;

                // 직무 구분 키워드가 충돌하면 다른 공고
                if (this.hasJobConflict(job.title, jobMap.get(candId)!.title)) continue;

                // 실제 유사도 재확인
                const sim = minhashes.get(job.id).jaccard(minhashes.get(candId));
                if (sim >= threshold) {
                    representativeOf.set(candId, job.id);
                    dupCount++;
                }
            }
        }

        // DB에 duplicateOf 기록
        let updated = 0;
        for (const [dupId, repId] of representativeOf) {
            await this.prisma.job.update({
                where: { id: dupId },
                data: { duplicateOf: repId },
            });
            updated++;
            if (updated % 200 === 0) this.logger.log(`중복 기록 중... ${updated}건`);
        }

        this.logger.log(`중복 제거 완료 - 중복 ${dupCount}건 발견, 대표 ${jobs.length - dupCount}건`);
        return { total: jobs.length, duplicates: dupCount, unique: jobs.length - dupCount };
    }

    // 직무를 가르는 핵심 키워드 그룹
    private jobDiscriminators(text: string): Set<string> {
        const t = text.toLowerCase().replace(/\s/g, '');
        const found = new Set<string>();

        const groups: Record<string, string[]> = {
            frontend: ['프론트', 'front', 'fe'],
            backend: ['백엔드', '백앤드', 'back', 'be', '서버개발'],
            fullstack: ['풀스택', 'fullstack', '풀스텍'],
            android: ['안드로이드', 'android'],
            ios: ['ios', '아이오에스'],
            ai: ['머신러닝', 'ml', '딥러닝', 'ai엔지니어', '인공지능'],
            data: ['데이터엔지니어', '데이터분석', 'dataengineer'],
            devops: ['devops', '데브옵스', 'sre', '인프라'],
            security: ['보안', 'security'],
            qa: ['qa', '테스트', 'test'],
            level_new: ['신입'],
            level_exp: ['경력', '시니어', 'senior'],
        };

        for (const [key, words] of Object.entries(groups)) {
            if (words.some((w) => t.includes(w))) found.add(key);
        }
        return found;
    }

    // 두 제목이 직무가 충돌하는지: 한쪽에만 있는 직무 키워드가 있으면 충돌
    private hasJobConflict(titleA: string, titleB: string): boolean {
        const a = this.jobDiscriminators(titleA);
        const b = this.jobDiscriminators(titleB);

        // 직무 카테고리에서 서로 다른 게 있으면 충돌
        const jobKeys = ['frontend', 'backend', 'fullstack', 'android', 'ios', 'ai', 'data', 'devops', 'security', 'qa'];
        const aJobs = jobKeys.filter((k) => a.has(k));
        const bJobs = jobKeys.filter((k) => b.has(k));

        // 둘 다 직무 키워드가 있는데 교집합이 없으면 다른 직무
        if (aJobs.length > 0 && bJobs.length > 0) {
            const overlap = aJobs.some((k) => bJobs.includes(k));
            if (!overlap) return true; 
        }
        return false;
    }

    async extractCareerEmployment() {
        const jobs = await this.prisma.job.findMany({
            where: { duplicateOf: null, isIT: true },
            select: { id: true, rawText: true },
        });

        this.logger.log(`경력/고용형태 추출 시작 - 대상 ${jobs.length}건`);

        let careerFilled = 0;
        let empFilled = 0;
        let updated = 0;

        for (const job of jobs) {
            const careerMin = this.parseCareer(job.rawText);
            const employmentType = this.parseEmployment(job.rawText);

            if (careerMin === null && employmentType === null) continue;

            await this.prisma.job.update({
                where: { id: job.id },
                data: { careerMin, employmentType },
            });

            if (careerMin !== null) careerFilled++;
            if (employmentType !== null) empFilled++;
            updated++;
            if (updated % 500 === 0) this.logger.log(`추출 중... ${updated}건`);
        }

        this.logger.log(`추출 완료 - 경력 ${careerFilled}건, 고용형태 ${empFilled}건`);
        return { total: jobs.length, careerFilled, empFilled };
    }

    private parseCareer(text: string): number | null {
        if (!text) return null;
        const t = text.replace(/\s/g, '');

        // 신입/경력무관 -> 0
        if (/신입/.test(t) && !/경력/.test(t)) return 0;
        if (/경력무관|경력·신입|신입·경력|경력\/신입|신입\/경력/.test(t)) return 0;

        // 경력N년이상 or 경력N년이상~M년이하 -> N
        const m = t.match(/경력[^0-9]{0,4}([0-9]{1,2})년/);
        if (m) return parseInt(m[1], 10);

        // 경력 키워드만 있고 숫자 없음 -> 1
        if (/경력/.test(t)) return 1;

        // 신입 -> 0
        if (/신입/.test(t)) return 0;

        return null;
    }

    private parseEmployment(text: string): string | null {
        if (!text) return null;
        const t = text.replace(/\s/g, '');

        if (/정규직/.test(t)) return '정규직';
        if (/계약직/.test(t)) return '계약직';
        if (/인턴/.test(t)) return '인턴';

        return null;
    }
}