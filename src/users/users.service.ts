import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';

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
            data: { email, password: hashed, name },
            select: { id: true, email: true, name: true, createdAt: true },
        });
    }

    async findOrCreateSocial(params: {
        provider: string;
        providerId: string;
        email?: string;
        name?: string;
    }) {
        // 같은 소셜 계정으로 이미 가입했는가
        const existing = await this.prisma.user.findUnique({
            where: {
                provider_providerId: {
                    provider: params.provider,
                    providerId: params.providerId,
                },
            },
        });
        if (existing) return existing;

        // 가입하지 않았다면
        return this.prisma.user.create({
            data: {
                provider: params.provider,
                providerId: params.providerId,
                email: params.email,
                name: params.name,
            },
        });
    }
}