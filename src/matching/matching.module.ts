import { Module } from '@nestjs/common';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { EmbeddingModule } from '../embedding/embedding.module';
import { PrismaService } from '../prisma.service';
import { ResumeModule } from '../resume/resume.module';

@Module({
  imports: [EmbeddingModule, ResumeModule],
  controllers: [MatchingController],
  providers: [MatchingService, PrismaService],
})
export class MatchingModule { }