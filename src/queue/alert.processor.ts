import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AlertService } from '../alert/alert.service';
import { ALERT_QUEUE } from './queue.constants';

@Processor(ALERT_QUEUE)
export class AlertProcessor extends WorkerHost {
    private readonly logger = new Logger(AlertProcessor.name);

    constructor(private alert: AlertService) {
        super();
    }

    async process(job: Job) {
        this.logger.log('알림 발송 작업 시작');
        return this.alert.sendAll();
    }
}