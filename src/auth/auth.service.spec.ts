import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';

describe('AuthService', () => {
  let service: AuthService;

  const users = {
    findByEmail: jest.fn(),
    findOrCreateSocial: jest.fn(),
    resetPassword: jest.fn(),
  };
  const jwt = { signAsync: jest.fn() };
  const redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const mail = { send: jest.fn() };

  let passwordHash: string;
  beforeAll(async () => {
    passwordHash = await bcrypt.hash('correct-password', 10);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    jwt.signAsync.mockResolvedValue('signed.jwt.token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: JwtService, useValue: jwt },
        { provide: RedisService, useValue: redis },
        { provide: MailService, useValue: mail },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login()', () => {
    it('올바른 비밀번호면 JWT 발급', async () => {
      users.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        name: '홍길동',
        password: passwordHash,
      });

      const res = await service.login('a@b.com', 'correct-password');

      expect(res.accessToken).toBe('signed.jwt.token');
      expect(res.user).toEqual({ id: 'u1', email: 'a@b.com', name: '홍길동' });
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'u1', email: 'a@b.com' });
    });

    it('비밀번호 틀리면 401', async () => {
      users.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        password: passwordHash,
      });

      await expect(service.login('a@b.com', 'wrong-password')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('없는 이메일이면 401', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(service.login('none@b.com', 'whatever')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('소셜 계정은 로컬 로그인 불가', async () => {
      users.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        password: null,
      });

      await expect(service.login('a@b.com', 'anything')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('requestPasswordReset()', () => {
    it('로컬 계정이면 재설정 토큰 저장하고 메일 발송', async () => {
      users.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        password: passwordHash,
      });

      const res = await service.requestPasswordReset('a@b.com');

      expect(res).toEqual({ ok: true });
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^pwreset:/),
        { userId: 'u1' },
        60 * 60,
      );
      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(mail.send.mock.calls[0][0]).toBe('a@b.com');
    });

    it('없는 이메일이면 메일 안 보내고 ok 반환', async () => {
      users.findByEmail.mockResolvedValue(null);

      const res = await service.requestPasswordReset('none@b.com');

      expect(res).toEqual({ ok: true });
      expect(mail.send).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('소셜 계정엔 재설정 메일 안 보냄', async () => {
      users.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        password: null,
      });

      const res = await service.requestPasswordReset('a@b.com');

      expect(res).toEqual({ ok: true });
      expect(mail.send).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword()', () => {
    it('유효한 토큰이면 비밀번호 변경하고 토큰 폐기', async () => {
      redis.get.mockResolvedValue({ userId: 'u1' });

      const res = await service.resetPassword('valid-token', 'new-password');

      expect(res).toEqual({ ok: true });
      expect(users.resetPassword).toHaveBeenCalledWith('u1', 'new-password');
      expect(redis.del).toHaveBeenCalledWith('pwreset:valid-token');
    });

    it('만료되거나 위조된 토큰이면 400', async () => {
      redis.get.mockResolvedValue(null);

      await expect(
        service.resetPassword('bad-token', 'new-password'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(users.resetPassword).not.toHaveBeenCalled();
    });
  });

  describe('socialLogin()', () => {
    it('소셜 로그인하면 JWT 발급', async () => {
      users.findOrCreateSocial.mockResolvedValue({
        id: 'u2',
        email: 'k@kakao.com',
        name: '사용자',
      });

      const res = await service.socialLogin({
        provider: 'kakao',
        providerId: '123',
        email: 'k@kakao.com',
      });

      expect(users.findOrCreateSocial).toHaveBeenCalledTimes(1);
      expect(res.accessToken).toBe('signed.jwt.token');
      expect(res.user.id).toBe('u2');
    });
  });
});
