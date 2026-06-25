import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis/redis.service';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

@Injectable()
export class InterviewService {
    private readonly openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
        private breaker: CircuitBreakerService,
    ) { }

    async generate(jobId: string, resumeText?: string) {
        const job = await this.prisma.job.findFirst({
            where: { id: jobId, duplicateOf: null, isIT: true },
        });
        if (!job) throw new NotFoundException('공고를 찾을 수 없습니다');

        // 캐시 키: 공고 + 이력서 조합
        const resumeHash = resumeText
            ? createHash('sha256').update(resumeText).digest('hex').slice(0, 16)
            : 'none';
        const key = `interview:${jobId}:${resumeHash}`;

        const cached = await this.redis.get<any>(key);
        if (cached) return cached;

        const jobText = [
            `제목: ${job.title}`,
            `회사: ${job.company}`,
            job.mainTasks ? `주요업무: ${job.mainTasks}` : '',
            job.requirements ? `자격요건: ${job.requirements}` : '',
            job.preferredPoints ? `우대사항: ${job.preferredPoints}` : '',
        ].filter(Boolean).join('\n');

        const system = `너는 IT 취업 면접을 준비하는 지원자를 돕는 어시스턴트야
채용공고를 보고, 이 공고에 지원했을 때 실제 면접에서 면접관이 물어볼 법한 예상 질문을 만들어주는 게 너의 역할이야
${resumeText ? '지원자 이력서가 함께 주어지면 이력서와 공고를 대조해서 이 지원자에게 특히 나올 만한 맞춤 질문을 만들어' : ''}

네가 하는 일
- 공고의 주요업무, 자격요건, 우대사항을 읽고, 그 자리에서 실제로 검증하려 할 역량을 파악해
- 그 역량을 면접관이 어떻게 구두로 물어볼지 질문 형태로 바꿔
${resumeText ? '- 이력서와 공고 사이의 차이(기술 스택 차이, 경력 수준 차이, 도메인 경험 유무)를 찾아서, 면접관이 그 부분을 어떻게 확인하려 할지 질문으로 만들어' : ''}

질문을 만드는 규칙
- 면접에서 말로 답하는 질문이어야 해. "~를 설계해보세요", "~를 구현해보세요" 같은 과제나 문제는 만들지 마. 그건 면접 질문이 아니라 과제야
- 대신 "~한 경험이 있나요", "~를 어떻게 풀어봤나요", "~와 ~중 무엇을 택하겠고 이유는" 처럼 경험과 사고 과정을 묻는 형태로 만들어
- 질문은 한 번에 하나만 물어. 한 질문에 여러 개를 욱여넣지 마 (나쁜 예시: "트랜잭션, 동시성, 캐시 관점에서 다 설명하세요")
- 공고에 실제로 적힌 요구사항에 근거해서 질문을 만들어야 해. 공고에 없는 기술이나 업무를 지어내지 마
- 너무 뻔한 질문(자기소개 해보세요 수준)은 피하고 그 공고 특유의 질문을 만들어
${resumeText ? '- 이력서에 없는 약점을 지적할 땐 비난조가 아니라 "면접관이 이 부분을 확인하려 할 수 있으니 준비해두면 좋다"는 톤으로' : ''}
- 존댓말로 하고 지원자가 면접을 준비하는 데 실질적으로 도움이 되도록 작성해

어떻게 분류하는지
- technical: 공고의 기술 스택, 업무와 직접 관련된 기술 질문
- experience: 일하는 방식, 협업, 문제 해결 경험을 묻는 질문
- tips: 이 공고 면접을 위해 미리 준비하면 좋을 것

출력 형식
아래 JSON으로만 답해. 다른 말 붙이지 마
{
  "technical": ["기술 질문"],
  "experience": ["경험·인성 질문"],
  "tips": ["면접 준비 팁"]
}
- technical 4~6개, experience 2~4개, tips 1~3개
- 각 질문은 면접관이 실제로 입으로 말하듯 자연스럽게

예시
공고: "핀테크 백엔드, 결제 시스템, Node.js, AWS" / 이력서: "3년차 백엔드, Express, AWS, 결제 경험 없음"
좋은 technical 질문: "결제처럼 같은 요청이 중복으로 들어올 수 있는 상황을 다뤄본 적이 있나요? 있다면 중복을 어떻게 막았는지 설명해 주세요."
좋은 tips 질문: "결제 도메인 용어(승인, 매입, 정산, 환불)와 기본 흐름을 미리 정리해두면, 도메인 경험이 없어도 빠르게 학습할 수 있다는 인상을 줄 수 있습니다."
좋은 experience 질문: "이 공고는 결제 도메인 경험을 우대하는데, 새로운 도메인에 빠르게 적응해야 했던 경험이 있다면 어떻게 익혔는지 들려주세요."
나쁜 질문(만들지 마): "결제 요청 수신부터 정산까지 흐름을 PostgreSQL과 Node.js로 설계해보세요." (이건 과제물이지 면접 질문이 아님)`;

        const userContent = resumeText
            ? `[채용공고]\n${jobText}\n\n[지원자 이력서]\n${resumeText}`
            : `[채용공고]\n${jobText}`;

        const res = await this.breaker.fire('openai', () =>
            this.openai.chat.completions.create({
                model: 'gpt-5-mini',
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: userContent },
                ],
            }),
        );

        let parsed: any;
        try {
            parsed = JSON.parse(res.choices[0].message.content ?? '{}');
        } catch {
            return { technical: [], experience: [], tips: [] };
        }

        await this.redis.set(key, parsed, 60 * 60 * 24 * 3); // 3일 캐시
        return parsed;
    }
}