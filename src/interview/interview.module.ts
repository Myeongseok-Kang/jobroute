import { Module } from '@nestjs/common';
import { InterviewService } from './interview.service';
import { InterviewController } from './interview.controller';
import { PrismaService } from '../prisma.service';
import { ResumeModule } from '../resume/resume.module';

@Module({
    imports: [ResumeModule],
    controllers: [InterviewController],
    providers: [InterviewService, PrismaService],
})
export class InterviewModule { }