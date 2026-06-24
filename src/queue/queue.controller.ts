import { Controller, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { COLLECT_QUEUE, EMBED_QUEUE } from './queue.constants';

@Controller('queue')
export class QueueController {
    constructor(
        @InjectQueue(COLLECT_QUEUE) private collectQueue: Queue,
        @InjectQueue(EMBED_QUEUE) private embedQueue: Queue,
    ) { }

    @Post('collect')
    async triggerCollect() {
        const job = await this.collectQueue.add('manual-collect', {});
        return { queued: true, jobId: job.id };
    }

    @Post('embed')
    async triggerEmbed() {
        const job = await this.embedQueue.add('manual-embed', {});
        return { queued: true, jobId: job.id };
    }
}