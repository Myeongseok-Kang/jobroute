import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { JobsModule } from './jobs/jobs.module';
import { ScraperModule } from './scraper/scraper.module';
import { CleaningModule } from './cleaning/cleaning.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JobsModule,
    ScraperModule,
    CleaningModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}