import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ResumeService {
    constructor(private prisma: PrismaService) { }

    create(userId: string, content: string, title?: string) {
        return this.prisma.resume.create({
            data: { userId, content, title },
        });
    }

    findAll(userId: string) {
        return this.prisma.resume.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' },
        });
    }

    async findOne(userId: string, id: string) {
        const resume = await this.prisma.resume.findUnique({ where: { id } });
        if (!resume) throw new NotFoundException('이력서를 찾을 수 없습니다');
        if (resume.userId !== userId) throw new ForbiddenException('접근 권한이 없습니다');
        return resume;
    }

    async update(userId: string, id: string, data: { content?: string; title?: string }) {
        await this.findOne(userId, id); // 존재 + 소유 확인
        return this.prisma.resume.update({ where: { id }, data });
    }

    async remove(userId: string, id: string) {
        await this.findOne(userId, id);
        return this.prisma.resume.delete({ where: { id } });
    }
}