import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Job } from 'bullmq';
import { ScraperService } from '../scraper/scraper.service';
import { COLLECT_QUEUE, EMBED_QUEUE } from './queue.constants';

@Processor(COLLECT_QUEUE)
export class CollectProcessor extends WorkerHost {
    private readonly logger = new Logger(CollectProcessor.name);

    constructor(
        private scraper: ScraperService,
        @InjectQueue(EMBED_QUEUE) private embedQueue: Queue,
    ) {
        super();
    }

    async process(job: Job) {
        this.logger.log('수집 시작');
        // 목록
        await this.scraper.scrapeSaramin();
        await this.scraper.scrapeJobkorea();

        // 상세
        await this.runDetails('saramin');
        await this.runDetails('jobkorea');

        this.logger.log('수집 완료 - 임베딩 큐에 작업 투입');

        await this.embedQueue.add('embed-all', {});

        return { done: true };
    }

    private async runDetails(site: 'saramin' | 'jobkorea') {
        while (true) {
            const r =
                site === 'saramin'
                    ? await this.scraper.scrapeSaraminDetails(100)
                    : await this.scraper.scrapeJobkoreaDetails(100);
            if (r.remaining === 0 || r.processed === 0) break;
        }
    }
}