import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { moscowDay } from '@n6b/db';
import { type AnswerData, searchChunks } from '@n6b/rag';
import { ownerPool, servicePool, tenantPool } from '../../../../packages/db/tests/int/helpers';
import { dontKnow } from '../../../../packages/rag/src/answer';
import { AXIS, QUESTION, request, seedAnswerFixture } from './answer-fixture';

const owner = ownerPool();
const cabinet = tenantPool(10);
const service = servicePool(10);
afterAll(async () => { await Promise.all([owner.end(), cabinet.end(), service.end()]); });
const fixture = (options?: Parameters<typeof seedAnswerFixture>[3]) => seedAnswerFixture(owner, cabinet, service, options);
const logs = async (botId: string) => (await owner.query(
  'SELECT outcome, channel, cited_chunk_ids FROM question_log WHERE bot_id = $1 ORDER BY created_at', [botId])).rows;
const eventCount = async (accountId: string) => Number((await owner.query(
  "SELECT count(*)::int AS n FROM growth_event WHERE account_id = $1 AND kind = 'first_cited_answer'", [accountId])).rows[0].n);
const marker = async (botId: string) => (await owner.query('SELECT first_cited_answer_at FROM bot WHERE id = $1', [botId])).rows[0].first_cited_answer_at;
const data = async (res: Response) => (await res.json() as { data: AnswerData }).data;

describe('ANS-01/02 real API + PaidGateway + pgvector ownership and provenance', () => {
  it('origin/session/UUID/body/question gates leave real DB quotas and attempt logs untouched', async () => {
    const a = await fixture();
    const missingOrigin = request(a.token); missingOrigin.headers.delete('origin');
    const checks: Array<[Request, string, number]> = [
      [missingOrigin, a.botId, 403], [request(a.token, undefined, { origin: 'https://foreign.test' }), a.botId, 403],
      [request(a.token, undefined, { cookie: '' }), a.botId, 401], [request(a.token), 'not-uuid', 404],
      [request(a.token, { question: '' }), a.botId, 422], [request(a.token, { question: 'x'.repeat(501) }), a.botId, 422],
      [request(a.token, { question: QUESTION, padding: 'x'.repeat(4096) }, { 'content-length': '1' }), a.botId, 413],
    ];
    for (const [req, botId, status] of checks) expect((await a.handler(req, botId)).status).toBe(status);
    expect(a.provider.total).toBe(0); expect(await logs(a.botId)).toEqual([]);
    expect((await owner.query('SELECT id FROM model_call_log WHERE account_id = $1', [a.accountId])).rows).toEqual([]);
    expect((await owner.query('SELECT scope FROM quota_counter WHERE scope = $1', [`answer:sandbox:${a.accountId}`])).rows).toEqual([]);
  });
  it('SC-US-005-1: own bot answers from DB; foreign bot 404 with zero provider and no log; body cannot choose channel', async () => {
    const a = await fixture(); const b = await fixture();
    expect((await a.handler(request(a.token), b.botId)).status).toBe(404);
    expect(a.provider.total).toBe(0); expect(await logs(b.botId)).toEqual([]);
    const res = await a.handler(request(a.token, { question: QUESTION, channel: 'visitor', account_id: b.accountId }), a.botId);
    expect(res.status).toBe(200);
    const answer = await data(res);
    expect(answer.outcome).toBe('answered'); expect(answer.show_cta).toBe(true);
    expect(answer.answer_text).not.toContain('model-evil');
    expect(answer.answer_text).toContain('<script>text</script>');
    expect(answer.citations).toEqual([{ chunk_id: a.chunkId, title: '<script>Доставка</script>',
      label: '<script>Доставка</script>', url: 'https://own.example.test/delivery' }]);
    expect(a.provider.calls).toEqual({ embed: 1, answer: 1 });
    expect(await logs(a.botId)).toEqual([{ outcome: 'answered', channel: 'sandbox', cited_chunk_ids: [a.chunkId] }]);
    expect(await eventCount(a.accountId)).toBe(1);
  });
  it('pgvector returns top5 own-bot IDs even with equally close foreign chunks', async () => {
    const a = await fixture(); const foreign = await fixture();
    for (let i = 1; i <= 6; i++) await owner.query(`INSERT INTO chunk
      (document_id, bot_id, account_id, ord, text, text_sha256, tokens, embedding)
      VALUES ($1, $2, $3, $4, 'text', $5, 1, $6)`,
    [a.documentId, a.botId, a.accountId, i, `extra-${i}`, JSON.stringify(AXIS)]);
    const ownIds = new Set((await owner.query('SELECT id FROM chunk WHERE bot_id = $1', [a.botId])).rows.map((r) => r.id));
    const hits = await searchChunks(service, a.botId, AXIS);
    expect(hits).toHaveLength(5); expect(hits.every((h) => ownIds.has(h.id))).toBe(true);
    expect(hits.some((h) => h.id === foreign.chunkId)).toBe(false);
  });
  it('PDF citations use own source filename and page', async () => {
    const a = await fixture();
    await owner.query("UPDATE source SET kind = 'pdf', file_name = 'Условия.pdf', url = NULL WHERE id = $1", [a.sourceId]);
    await owner.query('UPDATE document SET locator_url = NULL, locator_page = 4 WHERE id = $1', [a.documentId]);
    const answer = await data(await a.handler(request(a.token), a.botId));
    expect(answer.citations[0]).toMatchObject({ label: 'Условия.pdf, стр. 4', url: null });
  });
  it('same-account chunk pointing to a different bot source fails DB provenance, no citation/event', async () => {
    const a = await fixture();
    const otherBot = (await owner.query(`INSERT INTO bot (account_id, public_id, name) VALUES ($1, $2, 'other') RETURNING id`,
      [a.accountId, randomBytes(9).toString('base64url')])).rows[0].id;
    await owner.query('UPDATE source SET bot_id = $2 WHERE id = $1', [a.sourceId, otherBot]);
    const answer = await data(await a.handler(request(a.token), a.botId));
    expect(answer.outcome).toBe('invalid_citation'); expect(answer.citations).toEqual([]);
    expect(await marker(a.botId)).toBeNull(); expect(await eventCount(a.accountId)).toBe(0);
  });
});

describe('ANS-03 deterministic refusal reasons persist exactly once', () => {
  it('SC-US-006-1: below threshold skips generation; contact and no-contact hints', async () => {
    for (const contact of [null, 'owner@example.test']) {
      const a = await fixture({ contact });
      await owner.query('UPDATE chunk SET embedding = $2 WHERE id = $1', [a.chunkId, JSON.stringify(AXIS.map((x) => -x))]);
      const answer = await data(await a.handler(request(a.token), a.botId));
      expect(answer).toEqual({ answer_text: dontKnow(contact), citations: [], outcome: 'below_threshold', show_cta: false });
      expect(a.provider.calls).toEqual({ embed: 1, answer: 0 });
      expect(await logs(a.botId)).toEqual([{ outcome: 'below_threshold', channel: 'sandbox', cited_chunk_ids: [] }]);
      expect(await eventCount(a.accountId)).toBe(0);
    }
  });
  it.each(['unknown', 'empty', 'foreign', 'unretrieved', 'below-threshold'] as const)('SC-US-006-2: %s refuses and logs reason', async (scenario) => {
    const a = await fixture(); const foreign = await fixture();
    let ids = [a.chunkId]; let unknown = false;
    if (scenario === 'unknown') unknown = true;
    if (scenario === 'empty') ids = [];
    if (scenario === 'foreign') ids = [foreign.chunkId];
    if (scenario === 'unretrieved') ids = ['ffffffff-ffff-ffff-ffff-ffffffffffff'];
    if (scenario === 'below-threshold') {
      const row = (await owner.query(`INSERT INTO chunk
        (document_id, bot_id, account_id, ord, text, text_sha256, tokens, embedding)
        VALUES ($1, $2, $3, 1, 'low', 'low', 1, $4) RETURNING id`,
      [a.documentId, a.botId, a.accountId, JSON.stringify(AXIS.map((x) => -x))])).rows[0];
      ids = [row.id];
    }
    // New test binding uses the existing bot and the real gateway; no production selector.
    const { AnswerFixtureProvider, LIMITS, BASE } = await import('./answer-fixture');
    const { constructGateway } = await import('../../../../packages/rag/src/paid-call');
    const { createAskHandler } = await import('@/server/ask-handler');
    const provider = new AnswerFixtureProvider({ answer: { answer: 'Invented answer', unknown, cited_ids: ids } });
    const handler = createAskHandler({ publicBaseUrl: BASE, tenantPool: cabinet, servicePool: service, minSimilarity: 0.7,
      gateway: constructGateway({ pool: service, provider, limits: LIMITS, now: () => a.now }),
      authenticate: async () => a.accountId, log: () => undefined });
    const answer = await data(await handler(request(a.token), a.botId));
    const reason = scenario === 'unknown' || scenario === 'empty' ? 'model_unknown' : 'invalid_citation';
    expect(answer).toEqual({ answer_text: dontKnow(null), citations: [], outcome: reason, show_cta: false });
    expect(await logs(a.botId)).toEqual([{ outcome: reason, channel: 'sandbox', cited_chunk_ids: [] }]);
    expect(await marker(a.botId)).toBeNull(); expect(await eventCount(a.accountId)).toBe(0);
  });
});

describe('ANS-04 quota before embed and safe provider failures, no refunds or retries', () => {
  it('SC-US-016-1: exhausted sandbox quota returns 429/Retry-After/contact and one limited log, provider zero', async () => {
    const a = await fixture({ contact: 'owner@example.test' });
    await owner.query('INSERT INTO quota_counter(scope, day, used) VALUES ($1, $2, 100)',
      [`answer:sandbox:${a.accountId}`, moscowDay(a.now)]);
    const res = await a.handler(request(a.token), a.botId);
    expect(res.status).toBe(429); expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await res.json()).toMatchObject({ contact: 'owner@example.test', error: { code: 'limit_sandbox_account' } });
    expect(a.provider.total).toBe(0); expect(await logs(a.botId)).toEqual([{ outcome: 'limited', channel: 'sandbox', cited_chunk_ids: [] }]);
  });
  it.each([['unavailable'], ['timeout'], ['schema'], ['ok', 'unavailable'], ['ok', 'timeout'], ['ok', 'schema']] as const)(
    'SC-US-016-3: outcomes %j are safe 503, charged once and logged once', async (...outcomes) => {
      const a = await fixture({ outcomes });
      const res = await a.handler(request(a.token), a.botId);
      expect(res.status).toBe(503); expect(await res.json()).toMatchObject({ error: { code: 'provider_unavailable', message: 'Сервис ответа временно недоступен' } });
      expect(a.provider.calls.embed).toBe(1); expect(a.provider.calls.answer).toBe(outcomes.length === 2 ? 1 : 0);
      expect(await logs(a.botId)).toEqual([{ outcome: 'error', channel: 'sandbox', cited_chunk_ids: [] }]);
      expect((await owner.query('SELECT used FROM quota_counter WHERE scope = $1 AND day = $2',
        [`answer:sandbox:${a.accountId}`, moscowDay(a.now)])).rows[0].used).toBe(1);
      expect(await marker(a.botId)).toBeNull(); expect(await eventCount(a.accountId)).toBe(0);
    });
});

describe('ANS-05 atomic first cited answer', () => {
  it('SC-US-005-3: 10 concurrent answers → 10 logs, one marker/event/showCTA; provider awaits release connections', async () => {
    const limitedPool = servicePool(1);
    try {
      const a = await seedAnswerFixture(owner, cabinet, limitedPool, { delayMs: 50 });
      const answers = await Promise.all(Array.from({ length: 10 }, async () => {
        const res = await a.handler(request(a.token), a.botId); expect(res.status).toBe(200); return data(res);
      }));
      expect(answers.filter((r) => r.show_cta)).toHaveLength(1);
      expect(await logs(a.botId)).toHaveLength(10); expect(await marker(a.botId)).not.toBeNull();
      expect(await eventCount(a.accountId)).toBe(1); expect(a.provider.maxInFlight).toBeGreaterThan(1);
      expect(a.provider.calls).toEqual({ embed: 10, answer: 10 });
    } finally { await limitedPool.end(); }
  });
  it('two bots in the same account independently get first-answer events', async () => {
    const a = await fixture(); const b = await fixture({ accountId: a.accountId });
    const answers = await Promise.all([a, b].map(async (f) => data(await f.handler(request(f.token), f.botId))));
    expect(answers.map((r) => r.show_cta)).toEqual([true, true]);
    expect(answers.map((r) => r.outcome)).toEqual(['answered', 'answered']);
    expect(await eventCount(a.accountId)).toBe(2);
    expect(await marker(a.botId)).not.toBeNull(); expect(await marker(b.botId)).not.toBeNull();
    expect(await logs(a.botId)).toHaveLength(1); expect(await logs(b.botId)).toHaveLength(1);
  });
  it('growth event insertion failure rolls back the log and marker; recovery can become first answer', async () => {
    const a = await fixture();
    const name = `f07_fail_${randomBytes(5).toString('hex')}`;
    await owner.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.account_id = '${a.accountId}'::uuid THEN RAISE EXCEPTION 'intentional event insertion failure'; END IF;
      RETURN NEW; END $$`);
    try {
      await owner.query(`CREATE TRIGGER ${name} BEFORE INSERT ON growth_event FOR EACH ROW EXECUTE FUNCTION ${name}()`);
      const res = await a.handler(request(a.token), a.botId);
      expect(res.status).toBe(503); expect(await res.text()).not.toContain('intentional');
      expect(await logs(a.botId)).toEqual([]); expect(await marker(a.botId)).toBeNull();
      expect(await eventCount(a.accountId)).toBe(0);
    } finally {
      await owner.query(`DROP TRIGGER IF EXISTS ${name} ON growth_event`); await owner.query(`DROP FUNCTION ${name}()`);
    }
    expect((await data(await a.handler(request(a.token), a.botId))).show_cta).toBe(true);
    expect(await logs(a.botId)).toHaveLength(1); expect(await eventCount(a.accountId)).toBe(1);
  });
});
