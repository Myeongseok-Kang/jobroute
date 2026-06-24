import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { AlertService } from './alert.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('alert')
export class AlertController {
    constructor(private alert: AlertService) { }

    @UseGuards(JwtAuthGuard)
    @Get()
    get(@Request() req: any) {
        return this.alert.getSetting(req.user.id);
    }

    @UseGuards(JwtAuthGuard)
    @Post()
    set(@Request() req: any, @Body() body: { enabled: boolean; resumeId?: string }) {
        return this.alert.setEnabled(req.user.id, body.enabled, body.resumeId);
    }
}