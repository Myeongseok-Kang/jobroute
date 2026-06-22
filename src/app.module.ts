import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { JobsModule } from './jobs/jobs.module';
import { ScraperModule } from './scraper/scraper.module';
import { CleaningModule } from './cleaning/cleaning.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { MatchingModule } from './matching/matching.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ResumeModule } from './resume/resume.module';
import { BookmarkModule } from './bookmark/bookmark.module';
import { MatchHistoryModule } from './match-history/match-history.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JobsModule,
    ScraperModule,
    CleaningModule,
    EmbeddingModule,
    MatchingModule,
    AuthModule,
    UsersModule,
    ResumeModule,
    BookmarkModule,
    MatchHistoryModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}