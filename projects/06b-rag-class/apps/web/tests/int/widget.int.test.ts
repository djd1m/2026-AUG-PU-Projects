import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { readWidgetBot, recordWidgetQuestion, visitorKey, moscowDay } from '@n6b/db';
import { ownerPool, servicePool, tenantPool } from '../../../../packages/db/tests/int/helpers';
import { seedWidgetFixture, widgetRequest, HOST_ORIGIN, VISITOR_SECRET } from './widget-fixture';

const owner = ownerPool(); const cabinet = tenantPool(10); const service = servicePool(10);
afterAll(async () => { await Promise.all([owner.end(), cabinet.end(), service.end()]); });
const fixture = (options?: Parameters<typeof seedWidgetFixture>[3]) => seedWidgetFixture(owner, cabinet, service, options);
const installs = async (id: string) => (await owner.query(
  'SELECT origin_host, page_url, config_seen_at, first_question_at FROM widget_install WHERE bot_id = $1', [id])).rows;
const attemptCount = async (id: string) => Number((await owner.query(
  'SELECT count(*)::int AS n FROM model_call_log WHERE bot_id = $1', [id])).rows[0].n);
describe('WID-02/03/05 real public handler + PaidGateway + PG', () => {
  it('SC-US-007-3/008-1/3: denied publication/origin/body/IP leaves provider, paid logs and visitor quota untouched', async () => {
    const a = await fixture();
    for (const origin of [null, 'null', 'https://foreign.example', `${HOST_ORIGIN}/path`]) {
      for (const kind of ['ask', 'config', 'event'] as const) {
        const response = await a[kind](widgetRequest(a.publicId, kind, { origin }));
        expect(response.status).toBe(403); expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      }
    }
    expect((await a.ask(widgetRequest(a.publicId, 'ask', { method: 'OPTIONS' }))).status).toBe(204);
    for (const options of [{ body: { question: '' } }, { body: { question: 'ok', bot: 'wrong' } },
      { body: { question: 'x'.repeat(501) } }, { ip: null }]) {
      expect((await a.ask(widgetRequest(a.publicId, 'ask', options))).status).toBe(options.ip === null ? 503 : 422);
    }
    await owner.query('UPDATE bot SET published = false WHERE id = $1', [a.botId]);
    expect(await readWidgetBot(service, a.publicId)).toBeNull();
    expect((await a.ask(widgetRequest(a.publicId, 'ask'))).status).toBe(404);
    expect(a.provider.total).toBe(0); expect(await attemptCount(a.botId)).toBe(0); expect(await installs(a.botId)).toEqual([]);
    const key = visitorKey(VISITOR_SECRET, '203.0.113.99', a.botId);
    expect((await owner.query('SELECT scope FROM quota_counter WHERE scope = $1', [`answer:visitor:${key}`])).rows).toEqual([]);
  });
  it('public ID resolves actual owner/contact, cannot be replaced by body; widget log uses final-XFF HMAC', async () => {
    const a = await fixture({ contact: 'owner@example.test' }); const other = await fixture();
    expect(await readWidgetBot(service, a.publicId)).toMatchObject({ id: a.botId, accountId: a.accountId, contact: 'owner@example.test' });
    await a.config(widgetRequest(a.publicId, 'config'));
    const response = await a.ask(widgetRequest(a.publicId, 'ask', { body: { bot: a.publicId, question: 'Доставка?',
      accountId: other.accountId, visitor_key: 'spoof', channel: 'sandbox' } }));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ outcome: 'answered', citations: [{ chunk_id: a.chunkId }] });
    const rows = (await owner.query('SELECT account_id, channel, visitor_key, origin_host FROM question_log WHERE bot_id = $1', [a.botId])).rows;
    expect(rows).toEqual([{ account_id: a.accountId, channel: 'widget', origin_host: 'shop.example',
      visitor_key: visitorKey(VISITOR_SECRET, '203.0.113.99', a.botId) }]);
    expect(await attemptCount(other.botId)).toBe(0);
    expect((await installs(a.botId))[0].first_question_at).toBeInstanceOf(Date);
  });
  it('SC-US-009-1/2: plan/removal are read from own account, exact decision; event HMAC/day server-derived', async () => {
    const a = await fixture();
    for (const [plan, removal, required] of [['free', 'active', true], [' start', 'active', true],
      ['start', 'none', true], ['start', 'active', false], ['studio', 'active', false]] as const) {
      await owner.query('UPDATE account SET plan = $2, badge_removal = $3 WHERE id = $1', [a.accountId, plan, removal]);
      expect((await (await a.config(widgetRequest(a.publicId, 'config'))).json()).data.badge_required).toBe(required);
    }
    expect((await a.event(widgetRequest(a.publicId, 'event', { body: { kind: 'click' } }))).status).toBe(422);
    for (const kind of ['impression', 'tamper']) expect((await a.event(widgetRequest(a.publicId, 'event', {
      body: { kind, visitor_key: 'spoof', day: '2000-01-01' } }))).status).toBe(204);
    const rows = (await owner.query('SELECT kind, visitor_key, day::text FROM badge_event WHERE bot_id = $1 ORDER BY kind', [a.botId])).rows;
    expect(rows).toEqual(['impression', 'tamper'].map((kind) => ({ kind,
      visitor_key: visitorKey(VISITOR_SECRET, '203.0.113.99', a.botId), day: moscowDay(a.now) })));
  });
});
describe('WID-06 SC-US-015-1/2/4/5 real atomic install transitions', () => {
  it('concurrent config deduplicates normalized host and preserves initial page/time on repeats; bots stay separate', async () => {
    const a = await fixture(); const b = await fixture();
    const pages = Array.from({ length: 10 }, (_, i) => `${HOST_ORIGIN}/page-${i}`);
    const responses = await Promise.all(pages.map((page) => a.config(widgetRequest(a.publicId, 'config', { page }))));
    expect(responses.map((r) => r.status)).toEqual(Array(10).fill(200));
    const rows = await installs(a.botId); expect(rows).toHaveLength(1);
    expect(rows[0].origin_host).toBe('shop.example'); expect(pages).toContain(rows[0].page_url);
    expect(rows[0].first_question_at).toBeNull();
    await Promise.all(pages.map((page) => a.config(widgetRequest(a.publicId, 'config', { page }))));
    expect(await installs(a.botId)).toEqual(rows);
    await b.config(widgetRequest(b.publicId, 'config')); expect(await installs(b.botId)).toHaveLength(1);
  });
  it('concurrent accepted asks queue on real install row lock; exactly one first timestamp survives later overlap', async () => {
    const a = await fixture({ delayMs: 10 }); await a.config(widgetRequest(a.publicId, 'config'));
    const lock = await owner.connect(); let calls: Promise<Response>[] = [];
    try {
      await lock.query('BEGIN'); await lock.query('SELECT id FROM widget_install WHERE bot_id = $1 FOR UPDATE', [a.botId]);
      calls = Array.from({ length: 6 }, () => a.ask(widgetRequest(a.publicId, 'ask')));
      await lock.query('SELECT pg_sleep(0.2)'); await lock.query('COMMIT');
    } finally { await lock.query('ROLLBACK'); lock.release(); }
    expect((await Promise.all(calls)).map((r) => r.status)).toEqual(Array(6).fill(200));
    const first = await installs(a.botId); expect(first).toHaveLength(1); expect(first[0].first_question_at).toBeInstanceOf(Date);
    const bot = (await readWidgetBot(service, a.publicId))!;
    await Promise.all(Array.from({ length: 10 }, () => recordWidgetQuestion(service, bot, 'shop.example')));
    expect(await installs(a.botId)).toEqual(first);
  });
  it('each semantic success counts; ask without config never inserts an install', async () => {
    for (const [options, outcome] of [
      [{}, 'answered'],
      [{ answer: { answer: '', cited_ids: [], unknown: true } }, 'model_unknown'],
      [{ answer: { answer: 'bad', cited_ids: [randomUUID()], unknown: false } }, 'invalid_citation'],
    ] as const) {
      const a = await fixture(options);
      const response = await a.ask(widgetRequest(a.publicId, 'ask'));
      expect(response.status).toBe(200); expect((await response.json()).data.outcome).toBe(outcome);
      expect(await installs(a.botId)).toEqual([]);
      await a.config(widgetRequest(a.publicId, 'config'));
      expect((await a.ask(widgetRequest(a.publicId, 'ask'))).status).toBe(200);
      expect((await installs(a.botId))[0].first_question_at).toBeInstanceOf(Date);
    }
    const below = await fixture();
    await owner.query('DELETE FROM chunk WHERE bot_id = $1', [below.botId]);
    await below.config(widgetRequest(below.publicId, 'config'));
    expect((await (await below.ask(widgetRequest(below.publicId, 'ask'))).json()).data.outcome).toBe('below_threshold');
    expect((await installs(below.botId))[0].first_question_at).toBeInstanceOf(Date);
  });
  it('422/429/503 keep configured install uncounted; excluded/mismatch/test/operator configs never insert', async () => {
    const a = await fixture({ outcomes: ['unavailable'] }); await a.config(widgetRequest(a.publicId, 'config'));
    expect((await a.ask(widgetRequest(a.publicId, 'ask', { body: { question: '' } }))).status).toBe(422);
    expect((await a.ask(widgetRequest(a.publicId, 'ask'))).status).toBe(503);
    await owner.query(`INSERT INTO quota_counter (scope, day, used) VALUES ($1, $2, 300)
      ON CONFLICT (scope, day) DO UPDATE SET used = 300`, [`answer:bot:${a.botId}`, moscowDay(a.now)]);
    expect((await a.ask(widgetRequest(a.publicId, 'ask'))).status).toBe(429);
    expect((await installs(a.botId))[0].first_question_at).toBeNull();
    for (const origin of ['https://widget.example', 'http://localhost:8099', 'http://127.0.0.1', 'https://x.vercel.app']) {
      const b = await fixture(); await owner.query('UPDATE bot SET allowed_origins = $2 WHERE id = $1', [b.botId, [origin]]);
      expect((await b.config(widgetRequest(b.publicId, 'config', { origin, page: `${origin}/` }))).status).toBe(200);
      expect(await installs(b.botId)).toEqual([]);
    }
    const mismatch = await fixture(); await mismatch.config(widgetRequest(mismatch.publicId, 'config', { page: 'https://foreign.example/' }));
    expect(await installs(mismatch.botId)).toEqual([]);
    for (const kind of ['test', 'operator']) {
      const b = await fixture();
      if (kind === 'test') await owner.query('UPDATE account SET is_test = true WHERE id = $1', [b.accountId]);
      else await owner.query('INSERT INTO operator (account_id) VALUES ($1)', [b.accountId]);
      await b.config(widgetRequest(b.publicId, 'config')); expect((await b.ask(widgetRequest(b.publicId, 'ask'))).status).toBe(200);
      expect(await installs(b.botId)).toEqual([]);
    }
  });
});
