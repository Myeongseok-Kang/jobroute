import { Body, Controller, Get, Post, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

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
}