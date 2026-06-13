import { Controller, Post } from '@nestjs/common';
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
}