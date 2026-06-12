import { Controller, Get, Query } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) { }

  @Get()
  search(
    @Query('q') q?: string,
    @Query('region') region?: string,
    @Query('source') source?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.jobsService.search({
      q,
      region,
      source,
      page: page ? parseInt(page, 10) : 1,
      size: size ? parseInt(size, 10) : 20,
    });
  }
}