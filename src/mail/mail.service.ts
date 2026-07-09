import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private readonly from = process.env.MAIL_FROM ?? `잡루트 <${process.env.GMAIL_USER}>`;
    private transporter = process.env.MAIL_HOST
        ? nodemailer.createTransport({
            host: process.env.MAIL_HOST,
            port: process.env.MAIL_PORT ? parseInt(process.env.MAIL_PORT, 10) : 587,
            secure: process.env.MAIL_PORT === '465',
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASSWORD,
            },
        })
        : nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD,
            },
        });

    async send(to: string, subject: string, html: string) {
        try {
            await this.transporter.sendMail({
                from: this.from,
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