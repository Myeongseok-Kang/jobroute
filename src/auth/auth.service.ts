import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor(
        private users: UsersService,
        private jwt: JwtService,
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
    }) {
        const user = await this.users.findOrCreateSocial(socialUser);
        const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
        return { accessToken: token, user: { id: user.id, email: user.email, name: user.name } };
    }
}