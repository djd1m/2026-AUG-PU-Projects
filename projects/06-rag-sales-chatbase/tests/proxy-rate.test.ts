// из N5: projects/05-podcast-clips-opus/tests/proxy-rate.test.ts — дверь N6 пишет один адрес клиента,
// поэтому «число доверенных звеньев» заменено отказом на любую цепочку длиннее одного адреса.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type Redis from 'ioredis';
import { clientIp, ipPrefix } from '../apps/web/src/server/ip';
import { allowMutation, allowRead } from '../apps/web/src/server/rate-limit';

const headers = (value: string) => new Headers({ 'x-forwarded-for': value });
function fakeRedis() {
  const counts = new Map<string, number>();
  return { status: 'ready', eval: vi.fn(async (_script: string, _count: number, key: string) => {
    const count = (counts.get(key) ?? 0) + 1; counts.set(key, count); return count;
  }) } as unknown as Redis;
}
describe('Адрес клиента и префикс', () => {
  it('принимается ровно один адрес, записанный дверью', () => {
    expect(clientIp(headers('203.0.113.9'))).toBe('203.0.113.9');
    expect(clientIp(headers(' 2001:DB8::1 '))).toBe('2001:db8::1');
  });
  it('цепочка, пустота и мусор закрывают вход (дверь настроена не так — отказ, не догадка)', () => {
    for (const value of ['', '1.1.1.1, 203.0.113.9', 'bad', '203.0.113.9,']) expect(() => clientIp(headers(value)), value).toThrow();
    expect(() => clientIp(new Headers())).toThrow();
  });
  it('IPv6 /48: разные /48 не делят квоту, внутри /48 — делят', () => {
    expect(ipPrefix('2001:db8:1234::1')).not.toBe(ipPrefix('2001:db8:9999::5'));
    expect(ipPrefix('2001:db8:1234:5678::1')).toBe(ipPrefix('2001:db8:1234:ffff::9'));
  });
});
describe('Лимит частоты приложения (второй рубеж после двери)', () => {
  it('31-я мутация одной /24 отклонена; другая /24 проходит; соседний адрес не сбрасывает счётчик', async () => {
    const redis = fakeRedis();
    expect((await Promise.all(Array.from({ length: 31 }, () => allowMutation(redis, '203.0.113.9', 'test-key')))).filter(Boolean)).toHaveLength(30);
    expect(await allowMutation(redis, '198.51.100.7', 'test-key')).toBe(true);
    expect(await allowMutation(redis, '203.0.113.10', 'test-key')).toBe(false);
  });
  it('121-е чтение отклонено; в ключе нет адреса — только HMAC', async () => {
    const redis = fakeRedis();
    expect((await Promise.all(Array.from({ length: 121 }, () => allowRead(redis, '203.0.113.9', 'test-key')))).filter(Boolean)).toHaveLength(120);
    const key = vi.mocked(redis.eval).mock.calls[0]![2] as string;
    expect(key).toMatch(/^n6:read:rate:[0-9a-f]{64}$/);
  });
});
describe('Дверь (proxy/Caddyfile) — числа и заголовки', () => {
  const caddy = readFileSync('proxy/Caddyfile', 'utf8');
  it('30 мутаций / 120 чтений в минуту на {client_ip}, XFF заменяется адресом клиента', () => {
    expect(caddy).toMatch(/zone door_mutate \{\s*key \{client_ip\}\s*events 30\s*window 1m/);
    expect(caddy).toMatch(/zone door_read \{\s*key \{client_ip\}\s*events 120\s*window 1m/);
    expect(caddy).toContain('header_up X-Forwarded-For {client_ip}');
  });
  it('дверь НЕ ставит CORS: ровно один ACAO ставит только web (ADR-005)', () => {
    const active = caddy.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    expect(active).not.toMatch(/Access-Control-Allow-Origin/i);
  });
  it('модуль ограничения частоты проверяется на сборке образа', () => {
    expect(readFileSync('proxy/Dockerfile', 'utf8')).toMatch(/caddy list-modules \| grep -q 'http\.handlers\.rate_limit'/);
  });
});
