import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService) {}

  // 공고 전체 목록 가져오기
  findAll() {
    return this.prisma.job.findMany();
  }

  // 테스트용 공고
  createTest() {
    return this.prisma.job.create({
      data: {
        source: '테스트',
        sourceUrl: 'https://example.com/job/1',
        title: '백엔드 신입 개발자',
        company: '잡루트',
        location: '서울',
        salaryMin: 3000,
        salaryMax: 4000,
        contentHash: 'test-hash-' + Date.now(),
        rawText: '공고 원문 내용입니다.',
      },
    });
  }
}