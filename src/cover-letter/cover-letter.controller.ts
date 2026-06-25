import { Controller, Post, Query } from '@nestjs/common';
import { CoverLetterService } from './cover-letter.service';

@Controller('cover-letter')
export class CoverLetterController {
    constructor(private coverLetter: CoverLetterService) { }

    @Post('scrape')
    scrape(@Query('pages') pages?: string) {
        return this.coverLetter.scrapeCoverLetters(pages ? parseInt(pages, 10) : 5);
    }

    @Post('embed')
    embed() {
        return this.coverLetter.embedAll();
    }
}