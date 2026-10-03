import { afterAll, describe, expect, it } from 'vitest';
import { listCabinetBots, moscowDay, publishBot, readDemoBot, visitorKey } from '@n6b/db';
import { createDemoHandler } from '@/server/demo-handler';
import { createWidgetHandler } from '@/server/widget-handler';
import { constructGateway } from '../../../../packages/rag/src/paid-call';
import { ownerPool, servicePool, tenantPool } from '../../../../packages/db/tests/int/helpers';
import { seedWidgetFixture, VISITOR_SECRET, WIDGET_BASE, widgetRequest } from './widget-fixture';
import { LIMITS } from './answer-fixture';

const owner = ownerPool(); const cabinet = tenantPool(10); const service = servicePool(10);
afterAll(async () => { await Promise.all([owner.end(), cabinet.end(), service.end()]); });
export function demoRequest(slug: string, options: { origin?: string | null; type?: string; ip?: string | null; body?: unknown } = {}) {
  const headers: Record<string, string> = { 'Content-Type': options.type ?? 'application/json' };
  if (options.origin !== null) headers.origin = options.origin ?? WIDGET_BASE;
  if (options.ip !== null) headers['X-Forwarded-For'] = options.ip ?? '192.0.2.1, 203.0.113.99';
  return new Request(`${WIDGET_BASE}/api/demo/${slug}/ask`, { method: 'POST', headers,
    body: JSON.stringify(options.body ?? { question: 'Когда доставка?' }) });
}
async function fixture() {
  const a = await seedWidgetFixture(owner, cabinet, service);
  const published = await publishBot(cabinet, a.accountId, a.botId, { contact: 'owner@example.test', allowed_origins: [], demo_enabled: true });
  expect(published?.demo_slug).toMatch(/^[A-Za-z0-9_-]{24}$/);
  return { ...a, slug: published!.demo_slug!, demo: createDemoHandler(a.deps) };
}
const installRows = async (botId: string) => (await owner.query(
  'SELECT origin_host, page_url, config_seen_at, first_question_at FROM widget_install WHERE bot_id = $1 ORDER BY origin_host', [botId])).rows;
const callCount = async (botId: string) => Number((await owner.query(
  'SELECT count(*)::int AS n FROM model_call_log WHERE bot_id = $1', [botId])).rows[0].n);

describe('DEM-01/03/04 SC-US-012 real PG demo gate and answer path', () => {
  it('SC-US-012-1/2: published AND enabled lookup; empty widget allowlist still permits demo; identical closed gates', async () => {
    const a = await fixture();
    expect(await readDemoBot(service, a.slug)).toMatchObject({ id: a.botId, accountId: a.accountId, public_id: a.publicId });
    expect(await readDemoBot(service, 'unknown_slug_123')).toBeNull();
    expect(await readDemoBot(service, "' OR true --")).toBeNull();
    expect((await a.ask(widgetRequest(a.publicId, 'ask'))).status).toBe(403);
    for (const [published, enabled] of [[false, true], [true, false], [false, false]]) {
      await owner.query('UPDATE bot SET published = $2, demo_enabled = $3 WHERE id = $1', [a.botId, published, enabled]);
      expect(await readDemoBot(service, a.slug)).toBeNull();
      expect((await a.demo(demoRequest(a.slug), a.slug)).status).toBe(404);
    }
    expect((await a.demo(demoRequest('unknown_slug_123'), 'unknown_slug_123')).status).toBe(404);
    expect(a.provider.total).toBe(0); expect(await callCount(a.botId)).toBe(0);
    await owner.query('UPDATE bot SET published = true, demo_enabled = true WHERE id = $1', [a.botId]);
    expect((await a.demo(demoRequest(a.slug), a.slug)).status).toBe(200);
  });
  it('SC-US-012-5: foreign/simple POST and invalid body/IP do not change answer counters or call provider', async () => {
    const a = await fixture();
    for (const origin of [null, 'null', 'https://foreign.example', `${WIDGET_BASE}/path`]) {
      expect((await a.demo(demoRequest(a.slug, { origin }), a.slug)).status).toBe(403);
    }
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', 'application/json-wrong']) {
      expect((await a.demo(demoRequest(a.slug, { type }), a.slug)).status).toBe(403);
    }
    for (const options of [{ body: { question: '' } }, { body: { question: 'x'.repeat(501) } }, { ip: null }]) {
      expect((await a.demo(demoRequest(a.slug, options), a.slug)).status).toBe(options.ip === null ? 503 : 422);
    }
    const key = visitorKey(VISITOR_SECRET, '203.0.113.99', a.botId);
    expect((await owner.query('SELECT used FROM quota_counter WHERE scope = ANY($1::text[])',
      [[`answer:visitor:${key}`, `answer:bot:${a.botId}`]])).rows).toEqual([]);
    expect((await owner.query('SELECT id FROM question_log WHERE bot_id = $1', [a.botId])).rows).toEqual([]);
    expect(a.provider.total).toBe(0); expect(await callCount(a.botId)).toBe(0);
  });
  it('SC-US-012-1/3: citations/logChannel demo; no install creation or transition even with matching existing row', async () => {
    const a = await fixture();
    const first = await a.demo(demoRequest(a.slug, { body: { question: 'Доставка?', bot: 'spoof', accountId: 'spoof', channel: 'sandbox' } }), a.slug);
    expect(first.status).toBe(200); expect((await first.json()).data).toMatchObject({ outcome: 'answered', citations: [{ chunk_id: a.chunkId }] });
    expect(await installRows(a.botId)).toEqual([]);
    await owner.query(`INSERT INTO widget_install (bot_id, origin_host, page_url, config_seen_at)
      VALUES ($1, 'widget.example', $2, now())`, [a.botId, WIDGET_BASE]);
    const before = await installRows(a.botId);
    expect((await a.demo(demoRequest(a.slug), a.slug)).status).toBe(200);
    await owner.query(`UPDATE quota_counter SET used = $3 WHERE scope = $1 AND day = $2`,
      [`answer:visitor:${visitorKey(VISITOR_SECRET, '203.0.113.99', a.botId)}`, moscowDay(a.now), LIMITS.answerVisitorDay]);
    const limited = await a.demo(demoRequest(a.slug), a.slug);
    expect(limited.status).toBe(429); expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await limited.json()).toMatchObject({ contact: 'owner@example.test', error: { code: 'limit_reached' } });
    expect(await installRows(a.botId)).toEqual(before);
    const logs = (await owner.query('SELECT account_id, channel, visitor_key, origin_host, outcome FROM question_log WHERE bot_id = $1', [a.botId])).rows;
    expect(logs).toHaveLength(3);
    for (const log of logs) expect(log).toMatchObject({ account_id: a.accountId, channel: 'demo', origin_host: null,
      visitor_key: visitorKey(VISITOR_SECRET, '203.0.113.99', a.botId) });
    expect(logs.map((log) => log.outcome).sort()).toEqual(['answered', 'answered', 'limited']);
    expect(a.provider.total).toBe(4); expect(await callCount(a.botId)).toBe(4);
  });
  it.each(['visitor', 'bot'] as const)('SC-US-012-3: 50 shared widget+demo asks contend atomically at configured %s cap=3', async (cap) => {
    const a = await fixture();
    await owner.query('UPDATE bot SET allowed_origins = $2 WHERE id = $1', [a.botId, ['https://www.shop.example']]);
    const limits = { ...LIMITS, answerVisitorDay: 3, answerBotDay: cap === 'bot' ? 3 : 50 };
    expect(limits.answerVisitorDay).toBeLessThanOrEqual(limits.answerBotDay);
    const ips = Array.from({ length: 50 }, (_, i) => cap === 'visitor' ? '203.0.113.99' : `198.51.${i}.1`);
    expect(new Set(ips.map((ip) => visitorKey(VISITOR_SECRET, ip, a.botId))).size).toBe(cap === 'bot' ? 50 : 1);
    const gateway = constructGateway({ pool: service, provider: a.provider, limits, visitorSecret: VISITOR_SECRET, now: () => a.now });
    const deps = { ...a.deps, gateway };
    const widget = createWidgetHandler('ask', deps); const demo = createDemoHandler(deps);
    const calls = ips.map((ip, i) => {
      return i % 2 ? demo(demoRequest(a.slug, { ip }), a.slug) : widget(widgetRequest(a.publicId, 'ask', { ip }));
    });
    const responses = await Promise.all(calls);
    expect(responses.filter((res) => res.status === 200)).toHaveLength(3);
    expect(responses.filter((res) => res.status === 429)).toHaveLength(47);
    expect(a.provider.total).toBe(6); expect(await callCount(a.botId)).toBe(6);
    const key = cap === 'visitor' ? `answer:visitor:${visitorKey(VISITOR_SECRET, '203.0.113.99', a.botId)}` : `answer:bot:${a.botId}`;
    expect((await owner.query('SELECT used::int FROM quota_counter WHERE scope = $1 AND day = $2', [key, moscowDay(a.now)])).rows).toEqual([{ used: 3 }]);
    const logs = (await owner.query('SELECT channel, outcome FROM question_log WHERE bot_id = $1', [a.botId])).rows;
    expect(logs.filter((log) => log.channel === 'demo')).toHaveLength(25);
    expect(logs.filter((log) => log.channel === 'widget')).toHaveLength(25);
    expect(logs.filter((log) => log.outcome === 'limited')).toHaveLength(47);
    expect(await installRows(a.botId)).toEqual([]);
  });
});

describe('DEM-06 explicit owner publication, stable slug and concurrency', () => {
  it('SC-US-012-1/2: foreign owner cannot allocate; enable/disable/re-enable retains slug; legacy enabled/null repaired on save', async () => {
    const a = await seedWidgetFixture(owner, cabinet, service); const b = await seedWidgetFixture(owner, cabinet, service);
    const input = { contact: 'owner@example.test', allowed_origins: [], demo_enabled: true };
    expect(await publishBot(cabinet, b.accountId, a.botId, input)).toBeNull();
    expect((await owner.query('SELECT demo_slug FROM bot WHERE id = $1', [a.botId])).rows[0].demo_slug).toBeNull();
    await owner.query('UPDATE bot SET demo_enabled = true WHERE id = $1', [a.botId]);
    const enabled = await publishBot(cabinet, a.accountId, a.botId, { contact: input.contact, allowed_origins: [] });
    const slug = enabled!.demo_slug!; expect(slug).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect((await listCabinetBots(cabinet, a.accountId))[0]!.demo_slug).toBe(slug);
    const disabled = await publishBot(cabinet, a.accountId, a.botId, { ...input, demo_enabled: false });
    expect(disabled!.demo_slug).toBeNull(); expect(await readDemoBot(service, slug)).toBeNull();
    expect((await listCabinetBots(cabinet, a.accountId))[0]!.demo_slug).toBeNull();
    expect((await owner.query('SELECT demo_slug FROM bot WHERE id = $1', [a.botId])).rows[0].demo_slug).toBe(slug);
    expect((await publishBot(cabinet, a.accountId, a.botId, input))!.demo_slug).toBe(slug);
    expect((await readDemoBot(service, slug))!.public_id).toBe(a.publicId);
    expect(await listCabinetBots(cabinet, b.accountId)).not.toContainEqual(expect.objectContaining({ id: a.botId }));
  });
  it('SC-US-012-1: first concurrent enables allocate exactly one slug and preserve complete publication tuples', async () => {
    const a = await seedWidgetFixture(owner, cabinet, service);
    const lock = await owner.connect();
    const payloads = Array.from({ length: 8 }, (_, i) => ({ contact: `owner${i}@example.test`, allowed_origins: [`https://site${i}.test`], demo_enabled: true }));
    let calls: ReturnType<typeof publishBot>[] = [];
    try {
      await lock.query('BEGIN'); await lock.query('SELECT id FROM bot WHERE id = $1 FOR UPDATE', [a.botId]);
      calls = payloads.map((input) => publishBot(cabinet, a.accountId, a.botId, input));
      await lock.query('SELECT pg_sleep(0.1)'); await lock.query('COMMIT');
    } finally { await lock.query('ROLLBACK'); lock.release(); }
    const results = await Promise.all(calls);
    expect(new Set(results.map((result) => result!.demo_slug)).size).toBe(1);
    expect(results[0]!.demo_slug).toMatch(/^[A-Za-z0-9_-]{24}$/);
    for (let i = 0; i < results.length; i++) expect(results[i]).toMatchObject({ ...payloads[i], public_id: a.publicId });
    const final = (await owner.query('SELECT contact, allowed_origins, demo_enabled, demo_slug FROM bot WHERE id = $1', [a.botId])).rows[0];
    expect(payloads.map((input) => ({ ...input, demo_slug: results[0]!.demo_slug }))).toContainEqual(final);
  });
});
