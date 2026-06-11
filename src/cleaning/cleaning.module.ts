import { Module } from '@nestjs/common';
import { CleaningService } from './cleaning.service';
import { CleaningController } from './cleaning.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [CleaningController],
  providers: [CleaningService, PrismaService],
})
export class CleaningModule { }