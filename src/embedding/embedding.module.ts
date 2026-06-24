import { Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { EmbeddingController } from './embedding.controller';
import { PrismaService } from '../prisma.service';
import { RedisModule } from '../redis/redis.module';

@Module({
    imports: [RedisModule],
    controllers: [EmbeddingController],
    providers: [EmbeddingService, PrismaService],
    exports: [EmbeddingService],
})
export class EmbeddingModule { }