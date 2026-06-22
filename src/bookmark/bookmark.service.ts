import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class BookmarkService {
    constructor(private prisma: PrismaService) { }

    async toggle(userId: string, jobId: string) {
        const job = await this.prisma.job.findUnique({ where: { id: jobId } });
        if (!job) throw new NotFoundException('공고를 찾을 수 없습니다');

        const existing = await this.prisma.bookmark.findUnique({
            where: { userId_jobId: { userId, jobId } },
        });

        if (existing) {
            await this.prisma.bookmark.delete({ where: { id: existing.id } });
            return { bookmarked: false };
        }

        await this.prisma.bookmark.create({ data: { userId, jobId } });
        return { bookmarked: true };
    }

    findAll(userId: string) {
        return this.prisma.bookmark.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                createdAt: true,
                job: {
                    select: {
                        id: true,
                        title: true,
                        company: true,
                        location: true,
                        region: true,
                        source: true,
                        sourceUrl: true,
                    },
                },
            },
        });
    }
}