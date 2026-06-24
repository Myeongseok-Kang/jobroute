import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD,
        },
    });

    async send(to: string, subject: string, html: string) {
        try {
            await this.transporter.sendMail({
                from: `잡루트 <${process.env.GMAIL_USER}>`,
                to,
                subject,
                html,
            });
            this.logger.log(`메일 발송 완료 - ${to}`);
        } catch (e: any) {
            this.logger.error(`메일 발송 실패 - ${to}: ${e.message}`);
            throw e;
        }
    }
}