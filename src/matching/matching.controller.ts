import { Body, Controller, Post } from '@nestjs/common';
import { MatchingService } from './matching.service';

@Controller('matching')
export class MatchingController {
    constructor(private readonly matchingService: MatchingService) { }

    @Post()
    match(@Body() body: { text: string; region?: string; limit?: number }) {
        return this.matchingService.match(body);
    }
}