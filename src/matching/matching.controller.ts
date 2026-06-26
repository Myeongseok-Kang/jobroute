import { Body, Controller, Post, Param } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ResumeService } from '../resume/resume.service';
import { MatchHistoryService } from '../match-history/match-history.service';

@Controller('matching')
export class MatchingController {
    constructor(
        private matchingService: MatchingService,
        private resumeService: ResumeService,
        private matchHistory: MatchHistoryService,
    ) { }

    @Post()
    match(@Body() body: {
        text: string;
        userCareer?: number;
        employmentType?: string;
        region?: string;
        limit?: number;
    }) {
        return this.matchingService.match(body);
    }

    @Post('conditions')
    matchByConditions(@Body() body: {
        jobCategory?: string;
        skills?: string[];
        career?: string;
        employmentType?: string;
        region?: string;
        limit?: number;
    }) {
        return this.matchingService.matchByConditions(body);
    }

    @UseGuards(JwtAuthGuard)
    @Post('resume/:id')
    async matchByResume(
        @Request() req: any,
        @Param('id') id: string,
        @Body() body: { userCareer?: number; employmentType?: string; region?: string; limit?: number },
    ) {
        const resume = await this.resumeService.findOne(req.user.id, id);
        const result = await this.matchingService.match({
            text: resume.content,
            userCareer: body.userCareer,
            employmentType: body.employmentType,
            region: body.region,
            limit: body.limit,
        });

        await this.matchHistory.create(req.user.id, {
            inputType: 'resume',
            inputText: resume.content,
            result: result as any,
        });

        return result;
    }
}

