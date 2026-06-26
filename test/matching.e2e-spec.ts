import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import request from 'supertest';
import { MatchingController } from '../src/matching/matching.controller';
import { MatchingService } from '../src/matching/matching.service';
import { ResumeService } from '../src/resume/resume.service';
import { MatchHistoryService } from '../src/match-history/match-history.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

describe('Matching (e2e)', () => {
  let app: INestApplication;

  const matchResult = { total: 1, recommended: [], moreCandidates: [] };

  const matchingService = {
    match: jest.fn().mockResolvedValue(matchResult),
    matchByConditions: jest.fn().mockResolvedValue(matchResult),
  };
  const resumeService = {
    findOne: jest.fn().mockResolvedValue({ content: '3년차 백엔드 이력서' }),
  };
  const matchHistory = { create: jest.fn().mockResolvedValue(undefined) };

  const fakeJwtGuard = {
    canActivate: (ctx: ExecutionContext) => {
      const req = ctx.switchToHttp().getRequest();
      if (req.headers.authorization === 'Bearer valid-token') {
        req.user = { id: 'user-1' };
        return true;
      }
      throw new UnauthorizedException();
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [MatchingController],
      providers: [
        { provide: MatchingService, useValue: matchingService },
        { provide: ResumeService, useValue: resumeService },
        { provide: MatchHistoryService, useValue: matchHistory },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(fakeJwtGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  describe('POST /matching', () => {
    it('본문을 서비스에 전달하고 결과 반환', async () => {
      const body = { text: '백엔드', region: '서울', limit: 5 };

      const res = await request(app.getHttpServer())
        .post('/matching')
        .send(body)
        .expect(201);

      expect(res.body).toEqual(matchResult);
      expect(matchingService.match).toHaveBeenCalledWith(
        expect.objectContaining(body),
      );
    });
  });

  describe('POST /matching/conditions', () => {
    it('조건 매칭을 서비스에 위임', async () => {
      const body = { jobCategory: '백엔드', skills: ['NestJS'], career: '3년' };

      await request(app.getHttpServer())
        .post('/matching/conditions')
        .send(body)
        .expect(201);

      expect(matchingService.matchByConditions).toHaveBeenCalledWith(
        expect.objectContaining(body),
      );
    });
  });

  describe('POST /matching/resume/:id', () => {
    it('인증 없으면 401', async () => {
      await request(app.getHttpServer())
        .post('/matching/resume/resume-1')
        .send({})
        .expect(401);

      expect(matchingService.match).not.toHaveBeenCalled();
    });

    it('인증되면 본인 이력서로 매칭하고 이력 저장', async () => {
      const res = await request(app.getHttpServer())
        .post('/matching/resume/resume-1')
        .set('Authorization', 'Bearer valid-token')
        .send({ region: '서울' })
        .expect(201);

      expect(res.body).toEqual(matchResult);
      expect(resumeService.findOne).toHaveBeenCalledWith('user-1', 'resume-1');
      expect(matchingService.match).toHaveBeenCalledWith(
        expect.objectContaining({ text: '3년차 백엔드 이력서', region: '서울' }),
      );
      expect(matchHistory.create).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ inputType: 'resume' }),
      );
    });
  });
});
