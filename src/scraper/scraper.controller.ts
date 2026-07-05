import { Controller, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { ScraperService } from './scraper.service';

@UseGuards(AdminGuard)
@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) { }

  @Post('run')
  run() {
    return this.scraperService.scrapeWanted();
  }

  @Post('details')
  runDetails() {
    return this.scraperService.scrapeWantedDetails();
  }

  @Post('details/all')
  async runAllDetails() {
    let totalProcessed = 0;
    let totalFailed = 0;
    while (true) {
      const result = await this.scraperService.scrapeWantedDetails(100);
      totalProcessed += result.processed;
      totalFailed += result.failed;
      if (result.remaining === 0 || result.processed === 0) break;
    }
    return { totalProcessed, totalFailed };
  }

  @Post('saramin')
  runSaramin() {
    return this.scraperService.scrapeSaramin();
  }

  @Post('saramin/details')
  async runSaraminDetails() {
    let totalProcessed = 0;
    let totalFailed = 0;
    while (true) {
      const result = await this.scraperService.scrapeSaraminDetails(100);
      totalProcessed += result.processed;
      totalFailed += result.failed;
      if (result.remaining === 0 || result.processed === 0) break;
    }
    return { totalProcessed, totalFailed };
  }

  @Post('jobkorea')
  runJobkorea() {
    return this.scraperService.scrapeJobkorea();
  }

  @Post('revalidate')
  revalidate() {
    this.scraperService
      .revalidateActive()
      .catch((err) => console.error('revalidateActive 실패:', err));
    return { started: true };
  }

  @Post('jobkorea/details')
  async runJobkoreaDetails() {
    let totalProcessed = 0;
    let totalFailed = 0;
    while (true) {
      const r = await this.scraperService.scrapeJobkoreaDetails(100);
      totalProcessed += r.processed;
      totalFailed += r.failed;
      if (r.remaining === 0 || r.processed === 0) break;
    }
    return { totalProcessed, totalFailed };
  }
}