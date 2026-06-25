import { Module } from '@nestjs/common';
import { CoverLetterService } from './cover-letter.service';
import { CoverLetterController } from './cover-letter.controller';
import { PrismaService } from '../prisma.service';

@Module({
    controllers: [CoverLetterController],
    providers: [CoverLetterService, PrismaService],
})
export class CoverLetterModule { }