import { Controller, Post, Query, Body, Param, UseGuards, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CoverLetterService } from './cover-letter.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ResumeService } from '../resume/resume.service';

@Throttle({ default: { ttl: 60000, limit: 20 } })
@Controller('cover-letter')
export class CoverLetterController {
    constructor(
        private coverLetter: CoverLetterService,
        private resumeService: ResumeService,
    ) { }

    @Post('scrape')
    scrape(@Query('pages') pages?: string) {
        return this.coverLetter.scrapeCoverLetters(pages ? parseInt(pages, 10) : 5);
    }

    @Post('embed')
    embed() {
        return this.coverLetter.embedAll();
    }

    @Post('search')
    search(@Body() body: { query: string; jobCategory?: string }) {
        return this.coverLetter.search(body.query, 3, body.jobCategory);
    }

    // 초안 생성 (공고만)
    @Post('draft/:jobId')
    draft(@Param('jobId') jobId: string) {
        return this.coverLetter.draft(jobId);
    }

    // 초안 생성 (공고 + 이력서)
    @UseGuards(JwtAuthGuard)
    @Post('draft/:jobId/personalized')
    async draftPersonalized(
        @Request() req: any,
        @Param('jobId') jobId: string,
        @Body() body: { resumeId?: string },
    ) {
        const resume = body.resumeId
            ? await this.resumeService.findOne(req.user.id, body.resumeId)
            : await this.resumeService.findLatest(req.user.id);
        if (!resume) return { error: '이력서가 없습니다. 먼저 이력서를 등록해주세요.' };
        return this.coverLetter.draft(jobId, resume.content);
    }

    // 첨삭
    @Post('review')
    review(@Body() body: { content: string }) {
        return this.coverLetter.review(body.content);
    }
}