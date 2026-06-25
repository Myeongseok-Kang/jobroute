import { Module } from '@nestjs/common';
import { CoverLetterService } from './cover-letter.service';
import { CoverLetterController } from './cover-letter.controller';
import { PrismaService } from '../prisma.service';
import { ResumeModule } from '../resume/resume.module';

@Module({
    imports: [ResumeModule],
    controllers: [CoverLetterController],
    providers: [CoverLetterService, PrismaService],
})
export class CoverLetterModule { }