import { Controller, INestApplication, Post, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

const JWT_SECRET = 'test-secret-for-admin-guard';
const ADMIN_EMAIL = 'admin@jobroute.test';

process.env.JWT_SECRET = JWT_SECRET;
process.env.ADMIN_EMAIL = ADMIN_EMAIL;

import { AdminGuard } from '../src/auth/admin.guard';
import { JwtStrategy } from '../src/auth/jwt.strategy';

@UseGuards(AdminGuard)
@Controller('admin-only')
class DummyController {
  @Post('run')
  run() {
    return { ok: true };
  }
}

describe('AdminGuard (e2e)', () => {
  let app: INestApplication;
  const jwt = new JwtService({ secret: JWT_SECRET });

  const sign = (payload: { sub: string; email: string }) => jwt.sign(payload);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [DummyController],
      providers: [JwtStrategy],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('토큰이 없으면 401', async () => {
    await request(app.getHttpServer()).post('/admin-only/run').expect(401);
  });

  it('서명이 틀린 토큰이면 401', async () => {
    const bad = new JwtService({ secret: 'wrong-secret' }).sign({
      sub: 'u1',
      email: ADMIN_EMAIL,
    });
    await request(app.getHttpServer())
      .post('/admin-only/run')
      .set('Authorization', `Bearer ${bad}`)
      .expect(401);
  });

  it('인증됐지만 관리자 이메일이 아니면 403', async () => {
    const token = sign({ sub: 'u2', email: 'someone@else.com' });
    const res = await request(app.getHttpServer())
      .post('/admin-only/run')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(res.body.message).toContain('관리자');
  });

  it('관리자 이메일이면 200/201로 통과', async () => {
    const token = sign({ sub: 'u3', email: ADMIN_EMAIL });
    const res = await request(app.getHttpServer())
      .post('/admin-only/run')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(res.body).toEqual({ ok: true });
  });
});
