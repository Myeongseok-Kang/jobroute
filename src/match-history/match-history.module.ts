import { Module } from '@nestjs/common';
import { MatchHistoryService } from './match-history.service';
import { MatchHistoryController } from './match-history.controller';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MatchHistoryController],
  providers: [MatchHistoryService, PrismaService],
  exports: [MatchHistoryService],
})
export class MatchHistoryModule { }