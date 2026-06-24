import { Controller, Post } from '@nestjs/common';
import { CleaningService } from './cleaning.service';

@Controller('cleaning')
export class CleaningController {
    constructor(private readonly cleaningService: CleaningService) { }

    @Post('flag-body')
    flagBody() {
        return this.cleaningService.flagBodyQuality();
    }

    @Post('standardize-location')
    standardizeLocation() {
        return this.cleaningService.standardizeLocation();
    }

    @Post('deduplicate')
    deduplicate() {
        return this.cleaningService.deduplicate();
    }

    @Post('extract-career-employment')
    extractCareerEmployment() {
        return this.cleaningService.extractCareerEmployment();
    }
}