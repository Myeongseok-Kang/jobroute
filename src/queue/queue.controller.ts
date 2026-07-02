import { Controller, Post, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AdminGuard } from '../auth/admin.guard';
import { COLLECT_QUEUE, EMBED_QUEUE, ALERT_QUEUE } from './queue.constants';

@UseGuards(AdminGuard)
@Controller('queue')
export class QueueController {
    constructor(
        @InjectQueue(COLLECT_QUEUE) private collectQueue: Queue,
        @InjectQueue(EMBED_QUEUE) private embedQueue: Queue,
        @InjectQueue(ALERT_QUEUE) private alertQueue: Queue,
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

    @Post('alert')
    async triggerAlert() {
        const job = await this.alertQueue.add('manual-alert', {});
        return { queued: true, jobId: job.id };
    }
}