import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import CircuitBreaker from 'opossum';

export type BreakerName = 'voyage' | 'openai';

@Injectable()
export class CircuitBreakerService {
    private readonly logger = new Logger(CircuitBreakerService.name);
    private readonly breakers = new Map<BreakerName, CircuitBreaker<[() => Promise<unknown>], unknown>>();

    private getBreaker(name: BreakerName): CircuitBreaker<[() => Promise<unknown>], unknown> {
        const existing = this.breakers.get(name);
        if (existing) return existing;

        const breaker = new CircuitBreaker(
            async (fn: () => Promise<unknown>) => fn(),
            {
                name,
                timeout: 60_000,
                errorThresholdPercentage: 50,
                resetTimeout: 30_000,
                volumeThreshold: 5,
                rollingCountTimeout: 60_000,
                rollingCountBuckets: 10,
            },
        );

        breaker.on('open', () => this.logger.warn(`[${name}] 서킷 OPEN`));
        breaker.on('halfOpen', () => this.logger.log(`[${name}] 서킷 HALF-OPEN`));
        breaker.on('close', () => this.logger.log(`[${name}] 서킷 CLOSE`));
        breaker.on('timeout', () => this.logger.warn(`[${name}] 호출 타임아웃`));
        breaker.on('reject', () => this.logger.warn(`[${name}] OPEN 상태로 호출 거부`));

        this.breakers.set(name, breaker);
        return breaker;
    }

    async fire<T>(name: BreakerName, fn: () => Promise<T>): Promise<T> {
        try {
            return (await this.getBreaker(name).fire(fn as () => Promise<unknown>)) as T;
        } catch (err: unknown) {
            const code = (err as { code?: string })?.code;
            if (code === 'EOPENBREAKER') {
                throw new ServiceUnavailableException(
                    `${name} 서비스가 일시적으로 차단되었습니다. 잠시 후 다시 시도해주세요.`,
                );
            }
            if (code === 'ETIMEDOUT') {
                throw new ServiceUnavailableException(
                    `${name} 호출이 시간 초과되었습니다.`,
                );
            }
            throw err;
        }
    }
}
