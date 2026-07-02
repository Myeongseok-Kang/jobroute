import { Controller, Post, Param, Body, UseGuards, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InterviewService } from './interview.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ResumeService } from '../resume/resume.service';
import { PersonalizedDto } from './dto/interview.dto';

@Throttle({ default: { ttl: 60000, limit: 20 } })
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
    async personalized(
        @Request() req: any,
        @Param('jobId') jobId: string,
        @Body() body: PersonalizedDto,
    ) {
        const resume = body.resumeId
            ? await this.resumeService.findOne(req.user.id, body.resumeId)
            : await this.resumeService.findLatest(req.user.id);
        if (!resume) return { error: '이력서가 없습니다. 먼저 이력서를 등록해주세요.' };
        return this.interview.generate(jobId, resume.content);
    }
}