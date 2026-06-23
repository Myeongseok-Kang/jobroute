import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const CARD_SELECT = {
  id: true,
  source: true,
  sourceUrl: true,
  title: true,
  company: true,
  location: true,
  region: true,
  salaryMin: true,
  salaryMax: true,
  hasBody: true,
  createdAt: true,
};

@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService) { }

  async search(params: {
    q?: string;
    region?: string;
    source?: string;
    sort?: string;
    page?: number;
    size?: number;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const size = params.size && params.size > 0 ? Math.min(params.size, 50) : 20;

    const where: any = {
      duplicateOf: null,
      isIT: true,
    };

    if (params.q) {
      where.OR = [
        { title: { contains: params.q, mode: 'insensitive' } },
        { company: { contains: params.q, mode: 'insensitive' } },
        { rawText: { contains: params.q, mode: 'insensitive' } },
      ];
    }
    if (params.region) where.region = params.region;
    if (params.source) where.source = params.source;

    const orderBy =
      params.sort === 'oldest'
        ? { createdAt: 'asc' as const }
        : { createdAt: 'desc' as const };

    const [total, items] = await Promise.all([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        orderBy,
        skip: (page - 1) * size,
        take: size,
        select: CARD_SELECT,
      }),
    ]);

    return {
      total,
      page,
      size,
      totalPages: Math.ceil(total / size),
      items,
    };
  }

  async findOne(id: string) {
    const job = await this.prisma.job.findFirst({
      where: { id, duplicateOf: null, isIT: true },
      select: CARD_SELECT,
    });
    if (!job) throw new NotFoundException('공고를 찾을 수 없습니다');
    return job;
  }

  async latest(limit = 10) {
    return this.prisma.job.findMany({
      where: { duplicateOf: null, isIT: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
      select: CARD_SELECT,
    });
  }

  async popular(limit = 10) {
    const jobs = await this.prisma.job.findMany({
      where: { duplicateOf: null, isIT: true },
      orderBy: { bookmarks: { _count: 'desc' } },
      take: Math.min(limit, 50),
      select: {
        ...CARD_SELECT,
        _count: { select: { bookmarks: true } },
      },
    });

    return jobs.map((j) => {
      const { _count, ...rest } = j;
      return { ...rest, bookmarkCount: _count.bookmarks };
    });
  }
}