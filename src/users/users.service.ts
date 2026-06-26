import {
    Injectable,
    ConflictException,
    NotFoundException,
    BadRequestException,
    UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';

const PROFILE_SELECT = {
    id: true,
    email: true,
    name: true,
    image: true,
    provider: true,
    createdAt: true,
} as const;

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async findByEmail(email: string) {
        return this.prisma.user.findUnique({ where: { email } });
    }

    async create(email: string, password: string, name?: string) {
        const exists = await this.findByEmail(email);
        if (exists) throw new ConflictException('이미 가입된 이메일입니다');

        const hashed = await bcrypt.hash(password, 10);
        return this.prisma.user.create({
            data: { email, password: hashed, name: name || '사용자' },
            select: PROFILE_SELECT,
        });
    }

    async getProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: PROFILE_SELECT,
        });
        if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다');
        return user;
    }

    async updateProfile(userId: string, data: { name?: string }) {
        return this.prisma.user.update({
            where: { id: userId },
            data: { name: data.name },
            select: PROFILE_SELECT,
        });
    }

    async changePassword(userId: string, currentPassword: string, newPassword: string) {
        if (!newPassword || newPassword.length < 8) {
            throw new BadRequestException('새 비밀번호는 8자 이상이어야 합니다');
        }
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다');
        if (!user.password) {
            throw new BadRequestException('소셜 로그인 계정은 비밀번호를 변경할 수 없습니다');
        }
        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) throw new UnauthorizedException('현재 비밀번호가 올바르지 않습니다');

        const hashed = await bcrypt.hash(newPassword, 10);
        await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
        return { ok: true };
    }

    // 비밀번호 재설정
    async resetPassword(userId: string, newPassword: string) {
        if (!newPassword || newPassword.length < 8) {
            throw new BadRequestException('새 비밀번호는 8자 이상이어야 합니다');
        }
        const hashed = await bcrypt.hash(newPassword, 10);
        await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
        return { ok: true };
    }

    async deleteAccount(userId: string) {
        await this.prisma.user.delete({ where: { id: userId } });
        return { ok: true };
    }

    async findOrCreateSocial(params: {
        provider: string;
        providerId: string;
        email?: string;
        name?: string;
        image?: string;
    }) {

        const existing = await this.prisma.user.findUnique({
            where: {
                provider_providerId: {
                    provider: params.provider,
                    providerId: params.providerId,
                },
            },
        });
        if (existing) {
            // 사진 갱신
            if (params.image && params.image !== existing.image) {
                return this.prisma.user.update({
                    where: { id: existing.id },
                    data: { image: params.image },
                });
            }
            return existing;
        }

        // 계정 통합
        if (params.email) {
            const byEmail = await this.prisma.user.findUnique({
                where: { email: params.email },
            });
            if (byEmail) return byEmail;
        }

        // 신규 생성
        return this.prisma.user.create({
            data: {
                provider: params.provider,
                providerId: params.providerId,
                email: params.email,
                name: '사용자',
                image: params.image,
            },
        });
    }
}