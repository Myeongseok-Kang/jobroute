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

    private esc(s: any): string {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    private tag(text: string): string {
        return `<span style="display:inline-block;background:#eef4f2;color:#2d8a78;font-size:12px;padding:3px 9px;border-radius:999px;margin:0 4px 4px 0">${this.esc(text)}</span>`;
    }

    private reasonBlock(reason: any): string {
        if (!reason) return '';
        const summary = reason.summary
            ? `<p style="margin:0 0 8px;color:#444;font-size:13px;line-height:1.7">${this.esc(reason.summary)}</p>`
            : '';
        const bullets = (arr: string[], icon: string, color: string) =>
            (arr ?? [])
                .map(
                    (t) =>
                        `<tr><td style="vertical-align:top;color:${color};font-size:13px;padding:2px 6px 3px 0">${icon}</td><td style="color:#444;font-size:13px;line-height:1.6;padding-bottom:3px">${this.esc(t)}</td></tr>`,
                )
                .join('');
        const rows =
            bullets(reason.matches, '✓', '#2d8a78') +
            bullets(reason.confirm, '⚠', '#c98a00');
        const list = rows
            ? `<table style="border-collapse:collapse;width:100%">${rows}</table>`
            : '';
        if (!summary && !list) return '';
        return `
        <div style="background:#f7faf9;border:1px solid #eef4f2;border-radius:8px;padding:14px;margin:12px 0">
          <div style="font-weight:700;color:#2d8a78;font-size:13px;margin-bottom:8px">✨ AI 추천 이유</div>
          ${summary}
          ${list}
        </div>`;
    }

    private buildHtml(jobs: any[]): string {
        const pct = (v: any) => Math.round((Number(v) || 0) * 100);
        const careerLabel = (careerMin: any) =>
            careerMin == null || careerMin === 0 ? '신입' : `경력 ${careerMin}년+`;

        const items = jobs
            .map((j, i) => {
                const tags = [j.source, j.region, careerLabel(j.careerMin), j.employmentType]
                    .filter(Boolean)
                    .map((t) => this.tag(t))
                    .join('');
                return `
        <div style="border:1px solid #eee;border-radius:12px;padding:20px;margin-bottom:16px">
          <div style="color:#2d8a78;font-weight:700;font-size:13px;margin-bottom:6px">적합도 ${pct(j.score)}</div>
          <div style="margin-bottom:8px">${tags}</div>
          <h3 style="margin:0 0 4px;font-size:17px;line-height:1.4">
            <a href="${this.esc(j.sourceUrl)}" style="color:#111;text-decoration:none">${i + 1}. ${this.esc(j.title)}</a>
          </h3>
          <p style="margin:0;color:#666;font-size:13px">${this.esc(j.company)}${j.location ? ' · ' + this.esc(j.location) : ''}</p>
          ${this.reasonBlock(j.reason)}
          <div style="color:#999;font-size:12px;margin-bottom:12px">임베딩 유사도 ${pct(j.embedScore)}% · 키워드 ${pct(j.trgmScore)}%</div>
          <a href="${this.esc(j.sourceUrl)}" style="display:inline-block;background:#2d8a78;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 16px;border-radius:8px">공고 보기 →</a>
        </div>`;
            })
            .join('');

        const appUrl = process.env.FRONTEND_URL;
        const cta = appUrl
            ? `<div style="text-align:center;margin:8px 0 24px">
            <a href="${this.esc(appUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px">잡루트에서 면접 질문·자소서 초안 받기 →</a>
          </div>`
            : '';

        return `
      <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111">
        <h2 style="margin:0 0 4px">새로운 맞춤 공고 ${jobs.length}건</h2>
        <p style="color:#666;margin:0 0 20px">회원님 이력서에 맞는 새 공고를 찾았어요.</p>
        ${items}
        ${cta}
        <p style="color:#999;font-size:12px;margin-top:8px">
          알림을 원하지 않으시면 잡루트 설정에서 끌 수 있습니다.
        </p>
      </div>`;
    }
}