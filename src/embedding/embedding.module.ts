import { Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { EmbeddingController } from './embedding.controller';
import { PrismaService } from '../prisma.service';

@Module({
    controllers: [EmbeddingController],
    providers: [EmbeddingService, PrismaService],
})
export class EmbeddingModule { }