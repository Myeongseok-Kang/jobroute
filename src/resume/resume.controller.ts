import {
    Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ResumeService } from './resume.service';
import { CreateResumeDto, UpdateResumeDto } from './dto/resume.dto';

@UseGuards(JwtAuthGuard)
@Controller('resume')
export class ResumeController {
    constructor(private resume: ResumeService) { }

    @Post()
    create(@Request() req: any, @Body() body: CreateResumeDto) {
        return this.resume.create(req.user.id, body.content, body.title);
    }

    @Get()
    findAll(@Request() req: any) {
        return this.resume.findAll(req.user.id);
    }

    @Get(':id')
    findOne(@Request() req: any, @Param('id') id: string) {
        return this.resume.findOne(req.user.id, id);
    }

    @Patch(':id')
    update(@Request() req: any, @Param('id') id: string, @Body() body: UpdateResumeDto) {
        return this.resume.update(req.user.id, id, body);
    }

    @Delete(':id')
    remove(@Request() req: any, @Param('id') id: string) {
        return this.resume.remove(req.user.id, id);
    }
}