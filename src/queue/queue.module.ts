import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { COLLECT_QUEUE, EMBED_QUEUE } from './queue.constants';
import { CollectProcessor } from './collect.processor';
import { EmbedProcessor } from './embed.processor';
import { QueueScheduler } from './queue.scheduler';
import { QueueController } from './queue.controller';
import { ScraperModule } from '../scraper/scraper.module';
import { EmbeddingModule } from '../embedding/embedding.module';

@Module({
    imports: [
        BullModule.registerQueue(
            { name: COLLECT_QUEUE },
            { name: EMBED_QUEUE },
        ),
        ScraperModule,
        EmbeddingModule,
    ],
    providers: [CollectProcessor, EmbedProcessor, QueueScheduler],
    controllers: [QueueController],
})
export class QueueModule { }