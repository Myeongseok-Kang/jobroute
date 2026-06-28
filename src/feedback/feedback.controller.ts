import { Body, Controller, Get, Post, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FeedbackService } from './feedback.service';

@UseGuards(JwtAuthGuard)
@Controller('feedback')
export class FeedbackController {
  constructor(private feedback: FeedbackService) {}

  @Post()
  create(
    @Request() req: any,
    @Body() body: { content: string; phone?: string },
  ) {
    return this.feedback.create(req.user.id, body.content, body.phone);
  }

  @Get('me')
  findMine(@Request() req: any) {
    return this.feedback.findMine(req.user.id);
  }

  @Get('admin')
  findAll(@Request() req: any) {
    return this.feedback.findAllForAdmin(req.user.id);
  }
}
