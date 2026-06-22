import { Controller, Delete, Get, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MatchHistoryService } from './match-history.service';

@UseGuards(JwtAuthGuard)
@Controller('match-history')
export class MatchHistoryController {
    constructor(private history: MatchHistoryService) { }

    @Get()
    findAll(@Request() req: any) {
        return this.history.findAll(req.user.id);
    }

    @Get(':id')
    findOne(@Request() req: any, @Param('id') id: string) {
        return this.history.findOne(req.user.id, id);
    }

    @Delete(':id')
    remove(@Request() req: any, @Param('id') id: string) {
        return this.history.remove(req.user.id, id);
    }
}