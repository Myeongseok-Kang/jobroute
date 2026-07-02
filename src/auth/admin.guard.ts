import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class AdminGuard extends AuthGuard('jwt') {
    handleRequest<TUser = { id: string; email: string }>(
        err: any,
        user: any,
        info: any,
        context: ExecutionContext,
        status?: any,
    ): TUser {
        const authed = super.handleRequest<TUser>(err, user, info, context, status);
        const email = (authed as { email?: string })?.email;
        if (!email || email !== process.env.ADMIN_EMAIL) {
            throw new ForbiddenException('관리자만 접근할 수 있습니다');
        }
        return authed;
    }
}
