import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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
import { RedisModule } from './redis/redis.module';
import { ResumeModule } from './resume/resume.module';
import { BookmarkModule } from './bookmark/bookmark.module';
import { MatchHistoryModule } from './match-history/match-history.module';
import { QueueModule } from './queue/queue.module';
import { MailModule } from './mail/mail.module';
import { AlertModule } from './alert/alert.module';
import { InterviewModule } from './interview/interview.module';
import { CoverLetterModule } from './cover-letter/cover-letter.module';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 200 }]),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
      },
    }),
    RedisModule,
    CircuitBreakerModule,
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
    QueueModule,
    MailModule,
    AlertModule,
    InterviewModule,
    CoverLetterModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule { }