import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, content: string, phone?: string) {
    const trimmed = (content ?? '').trim();
    if (trimmed.length < 5) {
      throw new BadRequestException('후기를 5자 이상 입력해주세요');
    }
    return this.prisma.feedback.create({
      data: { userId, content: trimmed, phone: phone?.trim() || null },
    });
  }

  findMine(userId: string) {
    return this.prisma.feedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllForAdmin(userId: string) {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!me?.email || me.email !== process.env.ADMIN_EMAIL) {
      throw new ForbiddenException('관리자만 접근할 수 있습니다');
    }
    return this.prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, name: true } } },
    });
  }
}
