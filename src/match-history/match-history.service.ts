import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class MatchHistoryService {
    constructor(private prisma: PrismaService) { }

    create(userId: string, data: { inputType: string; inputText: string; result: any }) {
        return this.prisma.matchHistory.create({
            data: {
                userId,
                inputType: data.inputType,
                inputText: data.inputText,
                result: data.result,
            },
        });
    }

    // 목록
    findAll(userId: string) {
        return this.prisma.matchHistory.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                inputType: true,
                inputText: true,
                createdAt: true,
            },
        });
    }

    // 상세
    async findOne(userId: string, id: string) {
        const history = await this.prisma.matchHistory.findUnique({ where: { id } });
        if (!history) throw new NotFoundException('매칭 이력을 찾을 수 없습니다');
        if (history.userId !== userId) throw new ForbiddenException('접근 권한이 없습니다');
        return history;
    }

    async remove(userId: string, id: string) {
        await this.findOne(userId, id);
        return this.prisma.matchHistory.delete({ where: { id } });
    }
}