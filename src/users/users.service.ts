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
}