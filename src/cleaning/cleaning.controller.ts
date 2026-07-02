import { Controller, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { CleaningService } from './cleaning.service';

@UseGuards(AdminGuard)
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