import { describe, expect, it, vi } from 'vitest';
import type Redis from 'ioredis';
import { clientIp } from '../apps/web/src/server/ip';
import { allowMutation } from '../apps/web/src/server/rate-limit';
import { loadWebConfig } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';

const headers = (ip: string) => new Headers({ 'x-forwarded-for': `${ip}, 10.0.0.5, 172.18.0.2` });
describe('RV-001/003: доверенные звенья и независимые /24', () => {
  it('Примеры брифа: пропускает 2 или 1 звено, отказывает при 5', () => {
    expect(clientIp(headers('203.0.113.9'), 2)).toBe('203.0.113.9');
    expect(clientIp(headers('203.0.113.9'), 1)).toBe('10.0.0.5');
    expect(() => clientIp(headers('203.0.113.9'), 5)).toThrow();
  });
  it.each([0, -1, 1.5, NaN, Infinity])('Непригодное число звеньев %s', (hops) => {
    expect(() => clientIp(headers('203.0.113.9'), hops)).toThrow();
  });
  it('Недостаточная цепочка и неверный адрес закрывают вход', () => {
    for (const value of ['', '203.0.113.9', '203.0.113.9, 10.0.0.5', 'bad, 10.0.0.5, 172.18.0.2']) {
      expect(() => clientIp(new Headers({ 'x-forwarded-for': value }), 2)).toThrow();
    }
  });
  it('Явный дефолт 2, настраиваемое положительное целое', () => {
    const env = environment(); delete env.N5_TRUSTED_PROXY_HOPS;
    expect(loadWebConfig(env).trustedProxyHops).toBe(2);
    expect(loadWebConfig({ ...environment(), N5_TRUSTED_PROXY_HOPS: '1' }).trustedProxyHops).toBe(1);
    for (const value of ['', '0', '-1', '1.5', ' 2', '2e0', '9007199254740992']) {
      expect(() => loadWebConfig({ ...environment(), N5_TRUSTED_PROXY_HOPS: value })).toThrow('N5_TRUSTED_PROXY_HOPS');
    }
  });
  it('31-й запрос первой /24 отклонён; другая /24 проходит; соседний адрес не сбрасывает счётчик', async () => {
    const counts = new Map<string, number>();
    const redis = { status: 'ready', eval: vi.fn(async (_script, _count, key: string) => {
      const count = (counts.get(key) ?? 0) + 1; counts.set(key, count); return count;
    }) } as unknown as Redis;
    const first = clientIp(headers('203.0.113.9'), 2);
    expect((await Promise.all(Array.from({ length: 31 }, () => allowMutation(redis, first, 'test-key')))).filter(Boolean)).toHaveLength(30);
    expect(await allowMutation(redis, clientIp(headers('198.51.100.7'), 2), 'test-key')).toBe(true);
    expect(await allowMutation(redis, clientIp(headers('203.0.113.10'), 2), 'test-key')).toBe(false);
  });
});
