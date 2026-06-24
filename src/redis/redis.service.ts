import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private client!: Redis;

    onModuleInit() {
        this.client = new Redis({
            host: process.env.REDIS_HOST ?? 'localhost',
            port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
        });
        this.client.on('error', (e) => this.logger.error(`Redis 오류: ${e.message}`));
        this.client.on('connect', () => this.logger.log('Redis 연결됨'));
    }

    async onModuleDestroy() {
        await this.client.quit();
    }

    async get<T>(key: string): Promise<T | null> {
        const raw = await this.client.get(key);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return null;
        }
    }

    async set(key: string, value: unknown, ttlSeconds?: number) {
        const raw = JSON.stringify(value);
        if (ttlSeconds) {
            await this.client.set(key, raw, 'EX', ttlSeconds);
        } else {
            await this.client.set(key, raw);
        }
    }

    async del(key: string) {
        await this.client.del(key);
    }
}