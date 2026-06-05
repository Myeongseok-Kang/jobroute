import { Module } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { PrismaService } from '../prisma.service';
import { ScraperController } from './scraper.controller';

@Module({
  providers: [ScraperService, PrismaService],
  exports: [ScraperService],
  controllers: [ScraperController],
})
export class ScraperModule {}