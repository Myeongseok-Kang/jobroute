import { Controller, Post, Param, UseGuards, Request } from '@nestjs/common';
import { InterviewService } from './interview.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ResumeService } from '../resume/resume.service';

@Controller('interview')
export class InterviewController {
    constructor(
        private interview: InterviewService,
        private resumeService: ResumeService,
    ) { }

    // 공고만
    @Post(':jobId')
    generate(@Param('jobId') jobId: string) {
        return this.interview.generate(jobId);
    }

    // 공고 + 이력서
    @UseGuards(JwtAuthGuard)
    @Post(':jobId/personalized')
    async personalized(@Request() req: any, @Param('jobId') jobId: string) {
        const resume = await this.resumeService.findLatest(req.user.id);
        return this.interview.generate(jobId, resume?.content);
    }
}