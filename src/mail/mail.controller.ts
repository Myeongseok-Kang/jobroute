import { Controller, Post, Query } from '@nestjs/common';
import { MailService } from './mail.service';

@Controller('mail')
export class MailController {
    constructor(private mail: MailService) { }

    @Post('test')
    test(@Query('to') to: string) {
        return this.mail.send(
            to,
            '잡루트 테스트 메일',
            '<h2>잡루트 메일 발송 테스트</h2><p>이 메일이 보이면 발송 성공입니다.</p>',
        );
    }
}