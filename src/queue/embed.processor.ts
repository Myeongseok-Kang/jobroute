import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmbeddingService } from '../embedding/embedding.service';
import { EMBED_QUEUE } from './queue.constants';

@Processor(EMBED_QUEUE)
export class EmbedProcessor extends WorkerHost {
    private readonly logger = new Logger(EmbedProcessor.name);

    constructor(private embedding: EmbeddingService) {
        super();
    }

    async process(job: Job) {
        this.logger.log('임베딩 시작');
        const result = await this.embedding.embedAll();
        this.logger.log('임베딩 완료');
        return result;
    }
}