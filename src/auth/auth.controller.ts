import { Body, Controller, Get, Post, Patch, Delete, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthGuard } from '@nestjs/passport';
import { Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller('auth')
export class AuthController {
    constructor(
        private auth: AuthService,
        private users: UsersService,
    ) { }

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
        return this.users.getProfile(req.user.id);
    }

    @UseGuards(JwtAuthGuard)
    @Patch('me')
    updateMe(@Request() req: any, @Body() body: { name?: string }) {
        return this.users.updateProfile(req.user.id, { name: body.name });
    }

    @UseGuards(JwtAuthGuard)
    @Patch('me/password')
    changePassword(
        @Request() req: any,
        @Body() body: { currentPassword: string; newPassword: string },
    ) {
        return this.users.changePassword(req.user.id, body.currentPassword, body.newPassword);
    }

    @UseGuards(JwtAuthGuard)
    @Delete('me')
    deleteMe(@Request() req: any) {
        return this.users.deleteAccount(req.user.id);
    }

    @Post('password/forgot')
    forgotPassword(@Body() body: { email: string }) {
        return this.auth.requestPasswordReset(body.email);
    }

    @Post('password/reset')
    resetPassword(@Body() body: { token: string; newPassword: string }) {
        return this.auth.resetPassword(body.token, body.newPassword);
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