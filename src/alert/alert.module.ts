import { Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { AlertController } from './alert.controller';
import { PrismaService } from '../prisma.service';
import { MatchingModule } from '../matching/matching.module';

@Module({
    imports: [MatchingModule],
    controllers: [AlertController],
    providers: [AlertService, PrismaService],
    exports: [AlertService],
})
export class AlertModule { }