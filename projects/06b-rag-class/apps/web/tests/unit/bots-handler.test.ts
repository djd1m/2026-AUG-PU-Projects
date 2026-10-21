import { describe, expect, it, vi } from 'vitest';
import { type Pool } from '@n6b/db';
import { createBotHandler } from '@/server/bots-handler';
const BASE = 'https://n6b.example.test';
const trap = new Proxy({}, { get() { throw new Error('БД не должна вызываться'); } }) as Pool;
const request = (body: unknown, origin = BASE, cookie = true) => new Request(BASE + '/api/bots', { method: 'POST',
  headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie: `n6b_session=${'a'.repeat(43)}` } : {}) },
  body: JSON.stringify(body) });
describe('создание бота: границы до БД/HTTP', () => {
  const resolver = vi.fn(async () => [{ address: '10.0.0.1', family: 4 }]);
  const handler = createBotHandler({ tenantPool: trap, authenticate: async () => 'acc', publicBaseUrl: BASE, resolver, log: () => {} });
  it('Origin и сессия обязательны', async () => {
    expect((await handler(request({}, 'https://evil.test'))).status).toBe(403);
    expect((await handler(request({}, BASE, false))).status).toBe(401);
  });
  it('SC-US-002-3: literal, DNS private/mixed/failure → 422 без записи', async () => {
    for (const site_url of ['http://127.0.0.1/', 'http://169.254.169.254/', 'http://[::1]/', 'https://fixture.test/']) {
      expect((await handler(request({ name: 'Бот', site_url }))).status).toBe(422);
    }
    for (const resolve of [async () => { throw new Error('dns'); },
      async () => [{ address: '8.8.8.8', family: 4 }, { address: '192.168.0.1', family: 4 }]]) {
      const post = createBotHandler({ tenantPool: trap, authenticate: async () => 'acc', publicBaseUrl: BASE, resolver: resolve });
      expect((await post(request({ name: 'Бот', site_url: 'https://fixture.test' }))).status).toBe(422);
    }
  });
  it('имя и URL валидируются', async () => {
    for (const body of [{}, { name: '' }, { name: 'x'.repeat(201) }, { name: 'Бот', site_url: 'ftp://x.test' }]) {
      expect((await handler(request(body))).status).toBe(422);
    }
  });
});
