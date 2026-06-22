import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-kakao';

@Injectable()
export class KakaoStrategy extends PassportStrategy(Strategy, 'kakao') {
    constructor() {
        super({
            clientID: process.env.KAKAO_CLIENT_ID as string,
            clientSecret: process.env.KAKAO_CLIENT_SECRET as string,
            callbackURL: process.env.KAKAO_CALLBACK_URL as string,
        });
    }

    async validate(
        accessToken: string,
        refreshToken: string,
        profile: any,
        done: (err: any, user: any) => void,
    ) {
        const user = {
            provider: 'kakao',
            providerId: String(profile.id),
            email: profile._json?.kakao_account?.email,
            name: profile.displayName || profile.username,
        };
        done(null, user);
    }
}