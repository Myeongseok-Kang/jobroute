import { Controller, Get, Param, Query } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) { }

  @Get()
  search(
    @Query('q') q?: string,
    @Query('region') region?: string,
    @Query('source') source?: string,
    @Query('employmentType') employmentType?: string,
    @Query('career') career?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.jobsService.search({
      q,
      region,
      source,
      employmentType,
      career,
      sort,
      page: page ? parseInt(page, 10) : 1,
      size: size ? parseInt(size, 10) : 20,
    });
  }

  @Get('latest')
  latest(@Query('limit') limit?: string) {
    return this.jobsService.latest(limit ? parseInt(limit, 10) : 10);
  }

  @Get('popular')
  popular(@Query('limit') limit?: string) {
    return this.jobsService.popular(limit ? parseInt(limit, 10) : 10);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobsService.findOne(id);
  }
}