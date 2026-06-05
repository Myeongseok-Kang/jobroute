import { Controller, Post, Query } from '@nestjs/common';
import { ScraperService } from './scraper.service';

@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

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
}