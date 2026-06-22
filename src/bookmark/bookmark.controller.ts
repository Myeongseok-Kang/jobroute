import { Controller, Delete, Get, Param, Post, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BookmarkService } from './bookmark.service';

@UseGuards(JwtAuthGuard)
@Controller('bookmark')
export class BookmarkController {
    constructor(private bookmark: BookmarkService) { }

    @Post(':jobId')
    toggle(@Request() req: any, @Param('jobId') jobId: string) {
        return this.bookmark.toggle(req.user.id, jobId);
    }

    @Get()
    findAll(@Request() req: any) {
        return this.bookmark.findAll(req.user.id);
    }
}