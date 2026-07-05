import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MatchingService } from '../matching/matching.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AlertService {
    private readonly logger = new Logger(AlertService.name);

    constructor(
        private prisma: PrismaService,
        private matching: MatchingService,
        private mail: MailService,
    ) { }

    // 알림 끄고 켜기 및 기준 이력서 설정
    async setEnabled(userId: string, enabled: boolean, resumeId?: string) {
        return this.prisma.alertSetting.upsert({
            where: { userId },
            create: { userId, enabled, resumeId },
            update: { enabled, resumeId },
        });
    }

    async getSetting(userId: string) {
        return this.prisma.alertSetting.findUnique({ where: { userId } });
    }

    async sendAll() {
        const settings = await this.prisma.alertSetting.findMany({
            where: { enabled: true },
            include: { user: true },
        });

        this.logger.log(`알림 발송 시작 - 대상 ${settings.length}명`);

        let sent = 0;
        for (const setting of settings) {
            try {
                const ok = await this.sendOne(setting);
                if (ok) sent++;
            } catch (e: any) {
                this.logger.error(`알림 실패 - ${setting.userId}: ${e.message}`);
            }
        }

        this.logger.log(`알림 발송 완료 - ${sent}명`);
        return { total: settings.length, sent };
    }

    private async sendOne(setting: any): Promise<boolean> {
        const email = setting.user.email;
        if (!email) return false;

        // 기준 이력서 가져옴
        const resume = setting.resumeId
            ? await this.prisma.resume.findUnique({ where: { id: setting.resumeId } })
            : await this.prisma.resume.findFirst({
                where: { userId: setting.userId },
                orderBy: { createdAt: 'desc' },
            });
        if (!resume) return false;

        // 마지막 발송 이후 새로 생성된 공고만 후보
        const since = setting.lastSentAt ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const newCount = await this.prisma.job.count({
            where: {
                duplicateOf: null,
                isIT: true,
                createdAt: { gt: since },
                isActive: true,
                OR: [{ deadline: null }, { deadline: { gte: today } }],
            },
        });

        // 없으면 메일 x
        if (newCount === 0) {
            this.logger.log(`새 공고 없음 - ${setting.userId} 건너뜀`);
            return false;
        }

        // 새 공고 한정 이력서로 매칭
        const result = await this.matching.match({
            text: resume.content,
            limit: 5,
            since,
        });

        if (result.recommended.length === 0) return false;

        // 메일 발송
        const html = this.buildHtml(result.recommended);
        await this.mail.send(email, '잡루트 - 새로운 맞춤 공고가 도착했어요', html);

        // 발송 시각 갱신
        await this.prisma.alertSetting.update({
            where: { id: setting.id },
            data: { lastSentAt: new Date() },
        });

        return true;
    }

    private buildHtml(jobs: any[]): string {
        const items = jobs
            .map(
                (j) => `
        <div style="border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:12px">
          <h3 style="margin:0 0 6px">${j.title}</h3>
          <p style="margin:0;color:#666">${j.company} · ${j.region ?? ''}</p>
          <a href="${j.sourceUrl}" style="color:#2d8a78;text-decoration:none">공고 보기 →</a>
        </div>`,
            )
            .join('');

        return `
      <div style="max-width:600px;margin:0 auto;font-family:sans-serif">
        <h2>새로운 맞춤 공고</h2>
        <p style="color:#666">회원님께 맞는 새 공고를 찾았어요.</p>
        ${items}
        <p style="color:#999;font-size:12px;margin-top:24px">
          알림을 원하지 않으시면 설정에서 끌 수 있습니다.
        </p>
      </div>`;
    }
}