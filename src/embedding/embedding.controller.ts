import { Controller, Post, Get, Query, Header, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { EmbeddingService } from './embedding.service';

@Controller('embedding')
export class EmbeddingController {
    constructor(private readonly embeddingService: EmbeddingService) { }

    @UseGuards(AdminGuard)
    @Post('sample')
    sample() {
        return this.embeddingService.embedSample();
    }

    @UseGuards(AdminGuard)
    @Post('all')
    all() {
        return this.embeddingService.embedAll();
    }

    @Get('search')
    search(@Query('q') q: string) {
        return this.embeddingService.search(q);
    }

    @UseGuards(AdminGuard)
    @Post('flag-non-it')
    flagNonIT(@Query('threshold') threshold?: string) {
        return this.embeddingService.flagNonIT(threshold ? parseFloat(threshold) : 0.1);
    }

    @UseGuards(AdminGuard)
    @Get('debug')
    debug(
        @Query('min') min?: string,
        @Query('max') max?: string,
        @Query('dist') dist?: string,
    ) {
        return this.embeddingService.debugSimilarity({
            min: min ? parseFloat(min) : undefined,
            max: max ? parseFloat(max) : undefined,
            dist: dist === 'true',
        });
    }
}