import { Controller, Post, Get, Query, Header } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';

@Controller('embedding')
export class EmbeddingController {
    constructor(private readonly embeddingService: EmbeddingService) { }

    @Post('sample')
    sample() {
        return this.embeddingService.embedSample();
    }

    @Post('all')
    all() {
        return this.embeddingService.embedAll();
    }

    @Get('search')
    search(@Query('q') q: string) {
        return this.embeddingService.search(q);
    }

    @Post('flag-non-it')
    flagNonIT(@Query('threshold') threshold?: string) {
        return this.embeddingService.flagNonIT(threshold ? parseFloat(threshold) : 0.1);
    }

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