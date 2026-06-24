import { Module } from '@nestjs/common';
import { ResumeService } from './resume.service';
import { ResumeController } from './resume.controller';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ResumeController],
  providers: [ResumeService, PrismaService],
  exports: [ResumeService],
})
export class ResumeModule { }