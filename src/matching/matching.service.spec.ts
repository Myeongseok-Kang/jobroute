import { Test, TestingModule } from '@nestjs/testing';
import { MatchingService } from './matching.service';
import { PrismaService } from '../prisma.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { RedisService } from '../redis/redis.service';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

process.env.OPENAI_API_KEY ||= 'test-key';

type Row = Record<string, unknown>;

const makeRow = (i: number, over: Partial<Row> = {}): Row => ({
  id: `job-${i}`,
  title: `백엔드 엔지니어 ${i}`,
  company: `회사 ${i}`,
  location: '서울 강남구',
  region: '서울',
  source: 'wanted',
  sourceUrl: `https://example.com/${i}`,
  mainTasks: 'API 서버 개발',
  requirements: 'Node.js',
  preferredPoints: 'AWS',
  careerMin: 3,
  employmentType: 'fulltime',
  embed_score: 0.91,
  trgm_score: 0.42,
  career_score: 0.1,
  emp_score: 0.1,
  score: 0.83,
  ...over,
});

const llmResponse = (content: string) => ({
  choices: [{ message: { content } }],
});

const validReason = { summary: '핵심 기술이 맞습니다.', matches: ['Node.js'], confirm: [] };

describe('MatchingService', () => {
  let service: MatchingService;

  const prisma = { $queryRaw: jest.fn() };
  const embedding = { embedQuery: jest.fn() };
  const redis = { get: jest.fn(), set: jest.fn() };
  const breaker = { fire: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    embedding.embedQuery.mockResolvedValue([[0.1, 0.2, 0.3]]);
    redis.get.mockResolvedValue(null);
    breaker.fire.mockResolvedValue(llmResponse(JSON.stringify(validReason)));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmbeddingService, useValue: embedding },
        { provide: RedisService, useValue: redis },
        { provide: CircuitBreakerService, useValue: breaker },
      ],
    }).compile();

    service = module.get(MatchingService);
  });

  describe('match()', () => {
    it('텍스트 임베딩', async () => {
      prisma.$queryRaw.mockResolvedValue([makeRow(1)]);

      await service.match({ text: '3년차 백엔드 NestJS' });

      expect(embedding.embedQuery).toHaveBeenCalledTimes(1);
      expect(embedding.embedQuery).toHaveBeenCalledWith('3년차 백엔드 NestJS');
    });

    it('상위 10건은 추천 나머지는 후보', async () => {
      const rows = Array.from({ length: 12 }, (_, i) => makeRow(i));
      prisma.$queryRaw.mockResolvedValue(rows);

      const result = await service.match({ text: '백엔드' });

      expect(result.total).toBe(12);
      expect(result.recommended).toHaveLength(10);
      expect(result.moreCandidates).toHaveLength(2);
      expect(result.recommended[0].reason).toEqual(validReason);
      expect(result.moreCandidates[0]).not.toHaveProperty('reason');
      expect(breaker.fire).toHaveBeenCalledTimes(10);
    });

    it('DB 점수 컬럼을 응답 필드명으로 변환', async () => {
      prisma.$queryRaw.mockResolvedValue([
        makeRow(1, {
          embed_score: 0.95,
          trgm_score: 0.5,
          career_score: 0.05,
          emp_score: 0,
          score: 0.77,
        }),
      ]);

      const { recommended } = await service.match({ text: '백엔드' });

      expect(recommended[0]).toMatchObject({
        embedScore: 0.95,
        trgmScore: 0.5,
        careerScore: 0.05,
        empScore: 0,
        score: 0.77,
        careerMin: 3,
        employmentType: 'fulltime',
      });
    });

    it('추천 이유가 캐시에 있으면 그대로 쓴다', async () => {
      prisma.$queryRaw.mockResolvedValue([makeRow(1)]);
      const cached = { summary: '캐시된 이유', matches: [], confirm: [] };
      redis.get.mockResolvedValue(cached);

      const { recommended } = await service.match({ text: '백엔드' });

      expect(breaker.fire).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
      expect(recommended[0].reason).toEqual(cached);
    });

    it('LLM이 깨진 JSON을 반환하면 fall back', async () => {
      prisma.$queryRaw.mockResolvedValue([makeRow(1)]);
      breaker.fire.mockResolvedValue(llmResponse('보내준 JSON 아님 <<<'));

      const { recommended } = await service.match({ text: '백엔드' });

      expect(recommended[0].reason).toEqual({ summary: '', matches: [], confirm: [] });
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('캐시 미스 시 생성한 이유를 24시간 저장', async () => {
      prisma.$queryRaw.mockResolvedValue([makeRow(1)]);

      await service.match({ text: '백엔드' });

      expect(redis.set).toHaveBeenCalledTimes(1);
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('reason:'),
        validReason,
        60 * 60 * 24,
      );
    });
  });

  describe('matchByConditions()', () => {
    beforeEach(() => {
      jest
        .spyOn(service, 'match')
        .mockResolvedValue({ total: 0, recommended: [], moreCandidates: [] });
    });

    it('조건을 검색 텍스트로 합치고 필터를 그대로 전달', async () => {
      await service.matchByConditions({
        jobCategory: '백엔드',
        skills: ['NestJS', 'PostgreSQL'],
        career: '3년',
        employmentType: 'fulltime',
        region: '서울',
        limit: 5,
      });

      expect(service.match).toHaveBeenCalledTimes(1);
      const arg = (service.match as jest.Mock).mock.calls[0][0];
      expect(arg.region).toBe('서울');
      expect(arg.employmentType).toBe('fulltime');
      expect(arg.limit).toBe(5);
      expect(arg.userCareer).toBe(3);
      expect(arg.text).toContain('백엔드 개발자');
      expect(arg.text).toContain('NestJS, PostgreSQL 사용');
    });

    it.each([
      ['신입', 0],
      ['무관', 0],
      ['3년', 3],
      ['경력 5년', 5],
    ])('경력 "%s" 를 %i년으로 파싱', async (career, expected) => {
      await service.matchByConditions({ jobCategory: '백엔드', career });

      const arg = (service.match as jest.Mock).mock.calls[0][0];
      expect(arg.userCareer).toBe(expected);
    });

    it('경력 조건이 없으면 userCareer를 보내지 않음', async () => {
      await service.matchByConditions({ jobCategory: '백엔드' });

      const arg = (service.match as jest.Mock).mock.calls[0][0];
      expect(arg.userCareer).toBeUndefined();
    });
  });
});
