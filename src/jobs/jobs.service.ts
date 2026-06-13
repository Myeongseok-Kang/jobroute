import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService) {}

  async search(params: {
    q?: string;
    region?: string;
    source?: string;
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

    const [total, items] = await Promise.all([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
        select: {
          id: true,
          source: true,
          sourceUrl: true,
          title: true,
          company: true,
          location: true,
          region: true,
          hasBody: true,
          createdAt: true,
        },
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
}