import { ServiceUnavailableException } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(() => {
    service = new CircuitBreakerService();
  });

  it('성공하면 결과 반환', async () => {
    await expect(service.fire('openai', async () => 'ok')).resolves.toBe('ok');
  });

  it('서킷 닫힘 상태면 에러 보냄', async () => {
    await expect(
      service.fire('openai', async () => {
        throw new Error('upstream 5xx');
      }),
    ).rejects.toThrow('upstream 5xx');
  });

  it('연속 실패하면 서킷 열고 503 차단', async () => {
    const failOnce = () =>
      service
        .fire('openai', async () => {
          throw new Error('upstream down');
        })
        .catch((e) => e);

    for (let i = 0; i < 7; i++) {
      await failOnce();
    }

    const callback = jest.fn(async () => 'should not run');
    const err = await service.fire('openai', callback).catch((e) => e);

    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(callback).not.toHaveBeenCalled();
  });

  it('브레이커는 이름별로 독립', async () => {
    const failOnce = () =>
      service
        .fire('openai', async () => {
          throw new Error('openai down');
        })
        .catch((e) => e);

    for (let i = 0; i < 7; i++) {
      await failOnce();
    }

    await expect(service.fire('voyage', async () => 'voyage ok')).resolves.toBe(
      'voyage ok',
    );
  });
});
