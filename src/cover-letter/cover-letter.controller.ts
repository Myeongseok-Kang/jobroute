import { Controller, Post, Query, Body, Param, UseGuards, Request } from '@nestjs/common';
import { CoverLetterService } from './cover-letter.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ResumeService } from '../resume/resume.service';

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

    // 초안 생성
    @UseGuards(JwtAuthGuard)
    @Post('draft/:jobId')
    async draft(@Request() req: any, @Param('jobId') jobId: string) {
        const resume = await this.resumeService.findLatest(req.user.id);
        if (!resume) return { error: '이력서가 없습니다. 먼저 이력서를 등록해주세요.' };
        return this.coverLetter.draft(resume.content, jobId);
    }

    // 첨삭
    @Post('review')
    review(@Body() body: { content: string }) {
        return this.coverLetter.review(body.content);
    }
}