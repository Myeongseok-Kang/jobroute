import { Body, Controller, Get, Post, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthGuard } from '@nestjs/passport';
import { Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller('auth')
export class AuthController {
    constructor(private auth: AuthService) { }

    @Post('register')
    register(@Body() body: { email: string; password: string; name?: string }) {
        return this.auth.register(body.email, body.password, body.name);
    }

    @Post('login')
    login(@Body() body: { email: string; password: string }) {
        return this.auth.login(body.email, body.password);
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    me(@Request() req: any) {
        return req.user; 
    }

    @UseGuards(AuthGuard('google'))
    @Get('google')
    googleAuth() { }

    @UseGuards(AuthGuard('google'))
    @Get('google/callback')
    async googleCallback(@Request() req: any, @Res() res: Response) {
        const { accessToken } = await this.auth.socialLogin(req.user);
        const front = process.env.FRONTEND_URL ?? 'http://localhost:3001';
        res.redirect(`${front}/auth/callback?accessToken=${accessToken}`);
    }

    @UseGuards(AuthGuard('kakao'))
    @Get('kakao')
    kakaoAuth() { }

    @UseGuards(AuthGuard('kakao'))
    @Get('kakao/callback')
    async kakaoCallback(@Request() req: any, @Res() res: Response) {
        const { accessToken } = await this.auth.socialLogin(req.user);
        const front = process.env.FRONTEND_URL ?? 'http://localhost:3001';
        res.redirect(`${front}/auth/callback?accessToken=${accessToken}`);
    }
}