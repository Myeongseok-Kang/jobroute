import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const RESET_TTL = 60 * 60; // 1시간

@Injectable()
export class AuthService {
    constructor(
        private users: UsersService,
        private jwt: JwtService,
        private redis: RedisService,
        private mail: MailService,
    ) { }

    async register(email: string, password: string, name?: string) {
        return this.users.create(email, password, name);
    }

    async login(email: string, password: string) {
        const user = await this.users.findByEmail(email);
        if (!user || !user.password) throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다');

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다');

        const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
        return { accessToken: token, user: { id: user.id, email: user.email, name: user.name } };
    }

    async socialLogin(socialUser: {
        provider: string;
        providerId: string;
        email?: string;
        name?: string;
        image?: string;
    }) {
        const user = await this.users.findOrCreateSocial(socialUser);
        const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
        return { accessToken: token, user: { id: user.id, email: user.email, name: user.name } };
    }

    // 비밀번호 재설정 메일 발송
    async requestPasswordReset(email: string) {
        const user = email ? await this.users.findByEmail(email) : null;
        
        if (user && user.password) {
            const token = randomBytes(32).toString('hex');
            await this.redis.set(`pwreset:${token}`, { userId: user.id }, RESET_TTL);

            const front = process.env.FRONTEND_URL ?? 'http://localhost:3001';
            const link = `${front}/reset-password?token=${token}`;
            await this.mail.send(
                user.email!,
                '잡루트 비밀번호 재설정',
                `
        <div style="max-width:480px;margin:0 auto;font-family:sans-serif">
          <h2>비밀번호 재설정</h2>
          <p style="color:#555">아래 버튼을 눌러 새 비밀번호를 설정하세요. 링크는 1시간 후 만료됩니다.</p>
          <a href="${link}" style="display:inline-block;margin-top:12px;padding:12px 20px;background:#2d8a78;color:#fff;border-radius:8px;text-decoration:none">비밀번호 재설정</a>
          <p style="color:#999;font-size:12px;margin-top:20px">본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
        </div>`,
            );
        }
        return { ok: true };
    }

    async resetPassword(token: string, newPassword: string) {
        const key = `pwreset:${token}`;
        const data = await this.redis.get<{ userId: string }>(key);
        if (!data) throw new BadRequestException('유효하지 않거나 만료된 링크입니다');

        await this.users.resetPassword(data.userId, newPassword);
        await this.redis.del(key);
        return { ok: true };
    }
}
