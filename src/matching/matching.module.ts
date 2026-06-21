import { Module } from '@nestjs/common';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { EmbeddingModule } from '../embedding/embedding.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [EmbeddingModule],
  controllers: [MatchingController],
  providers: [MatchingService, PrismaService],
})
export class MatchingModule { }