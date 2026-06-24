import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ALERT_QUEUE, COLLECT_QUEUE, EMBED_QUEUE } from './queue.constants';
import { CollectProcessor } from './collect.processor';
import { EmbedProcessor } from './embed.processor';
import { QueueScheduler } from './queue.scheduler';
import { QueueController } from './queue.controller';
import { ScraperModule } from '../scraper/scraper.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { AlertProcessor } from './alert.processor';
import { AlertModule } from '../alert/alert.module';

@Module({
    imports: [
        BullModule.registerQueue(
            { name: COLLECT_QUEUE },
            { name: EMBED_QUEUE },
            { name: ALERT_QUEUE },
        ),
        ScraperModule,
        EmbeddingModule,
        AlertModule,
    ],
    providers: [CollectProcessor, EmbedProcessor, QueueScheduler, AlertProcessor],
    controllers: [QueueController],
})
export class QueueModule { }