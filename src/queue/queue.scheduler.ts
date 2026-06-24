import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { COLLECT_QUEUE, ALERT_QUEUE } from './queue.constants';

@Injectable()
export class QueueScheduler implements OnModuleInit {
    private readonly logger = new Logger(QueueScheduler.name);

    constructor(
        @InjectQueue(COLLECT_QUEUE) private collectQueue: Queue,
        @InjectQueue(ALERT_QUEUE) private alertQueue: Queue,
    ) { }

    async onModuleInit() {
        // 매일 새벽 3시에 수집 작업을 큐에
        await this.collectQueue.add(
            'daily-collect',
            {},
            {
                repeat: { pattern: '0 3 * * *' },
                jobId: 'daily-collect', // 중복 x
            },
        );
        this.logger.log('일일 수집 스케줄 등록 완료 (매일 03:00)');

        // 매일 아침 9시에 알림 발송 작업을 큐에
        await this.alertQueue.add(
            'daily-alert',
            {},
            {
                repeat: { pattern: '0 9 * * *' },
                jobId: 'daily-alert',
            },
        );
        this.logger.log('일일 알림 스케줄 등록 완료 (매일 09:00)');
    }
}