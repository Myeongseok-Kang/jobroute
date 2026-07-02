import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { UsersService } from '../src/users/users.service';
import { MatchingController } from '../src/matching/matching.controller';
import { MatchingService } from '../src/matching/matching.service';
import { ResumeService } from '../src/resume/resume.service';
import { MatchHistoryService } from '../src/match-history/match-history.service';

describe('ValidationPipe (e2e)', () => {
  let app: INestApplication;

  const authService = {
    register: jest.fn().mockResolvedValue({ id: 'u1' }),
    login: jest.fn().mockResolvedValue({ accessToken: 't' }),
  };
  const matchingService = {
    match: jest.fn().mockResolvedValue({ total: 0, recommended: [] }),
    matchByConditions: jest.fn().mockResolvedValue({ total: 0 }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController, MatchingController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: {} },
        { provide: MatchingService, useValue: matchingService },
        { provide: ResumeService, useValue: {} },
        { provide: MatchHistoryService, useValue: {} },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  describe('POST /auth/register', () => {
    it('이메일 형식이 아니면 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('비밀번호가 8자 미만이면 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'a@b.com', password: 'short' })
        .expect(400);
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('유효하면 통과하고 서비스 호출', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'a@b.com', password: 'password123', name: '홍길동' })
        .expect(201);
      expect(authService.register).toHaveBeenCalledWith(
        'a@b.com',
        'password123',
        '홍길동',
      );
    });
  });

  describe('POST /matching', () => {
    it('text가 없으면 400', async () => {
      await request(app.getHttpServer())
        .post('/matching')
        .send({ region: '서울' })
        .expect(400);
      expect(matchingService.match).not.toHaveBeenCalled();
    });

    it('limit이 숫자가 아니면 400', async () => {
      await request(app.getHttpServer())
        .post('/matching')
        .send({ text: '백엔드', limit: 'ten' })
        .expect(400);
      expect(matchingService.match).not.toHaveBeenCalled();
    });

    it('whitelist가 미허용 필드를 제거', async () => {
      await request(app.getHttpServer())
        .post('/matching')
        .send({ text: '백엔드', region: '서울', hacked: true })
        .expect(201);
      const arg = matchingService.match.mock.calls[0][0];
      expect(arg).toEqual({ text: '백엔드', region: '서울' });
      expect(arg.hacked).toBeUndefined();
    });
  });
});
