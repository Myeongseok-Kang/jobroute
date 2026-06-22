import { Body, Controller, Post, Param } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ResumeService } from '../resume/resume.service';

@Controller('matching')
export class MatchingController {
    constructor(
        private matchingService: MatchingService,
        private resumeService: ResumeService,
    ) { }

    @Post()
    match(@Body() body: { text: string; region?: string; limit?: number }) {
        return this.matchingService.match(body);
    }

    @Post('conditions')
    matchByConditions(@Body() body: {
        jobCategory?: string;
        skills?: string[];
        career?: string;
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
        @Body() body: { region?: string; limit?: number },
    ) {
        const resume = await this.resumeService.findOne(req.user.id, id);
        return this.matchingService.match({
            text: resume.content,
            region: body.region,
            limit: body.limit,
        });
    }
}

