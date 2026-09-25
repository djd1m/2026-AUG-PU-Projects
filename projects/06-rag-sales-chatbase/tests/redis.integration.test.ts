// Лимит частоты на НАСТОЯЩЕМ Redis: Lua-скрипт INCR + PEXPIRE атомарен при конкуренции
// (последовательный тест зеленеет и при неатомарной реализации — shared-resource-verification).
import { afterAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import { allowMutation } from '../apps/web/src/server/rate-limit';

const redisUrl = process.env.REDIS_URL;
describe.skipIf(!redisUrl)('Redis: лимит частоты приложения', () => {
  const redis = new Redis(redisUrl ?? 'redis://invalid', { lazyConnect: true, maxRetriesPerRequest: 1 });
  afterAll(async () => { redis.disconnect(); });
  it('40 одновременных мутаций одной /24 → ровно 30 пропущено; ключ живёт ≤ 60 с', async () => {
    const secret = randomBytes(16).toString('hex');
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => allowMutation(redis, `198.51.100.${i + 1}`, secret)));
    expect(results.filter(Boolean)).toHaveLength(30);
    const keys = await redis.keys('n6:mutation:rate:*');
    const ttls = await Promise.all(keys.map((k) => redis.pttl(k)));
    expect(ttls.every((t) => t > 0 && t <= 60000)).toBe(true);
  });
});
