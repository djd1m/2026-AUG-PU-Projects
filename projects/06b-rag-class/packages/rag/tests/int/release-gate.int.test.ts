import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { withService, type AnswerBot } from '@n6b/db';
import { createFixture, prepareCorpus, readEvidence, seedCorpus } from '../../../../scripts/calibration/live-store';
import type { CorpusDocument } from '../../../../scripts/calibration/evaluate';
import { ownerPool, servicePool } from '../../../db/tests/int/helpers';
import { constructGateway } from '../../src/paid-call';
import { FakeProvider } from '../../src/provider/fake';
import { searchChunks } from '../../src/search';
import { sha256 } from '../../src/chunk';

// Real SQL/roles; only provider vectors and answers are fake. No calibration claim.
const owner = ownerPool();
const service = servicePool(2);
const corpus = JSON.parse(readFileSync('tests/calibration/corpus.json', 'utf8')) as CorpusDocument[];
const prepared = prepareCorpus(corpus);
const provider = new FakeProvider();
const gateway = constructGateway({ pool: service, provider, limits: {
  answerVisitorDay: 30, answerBotDay: 300, answerGlobalDay: 3000,
  sandboxAccountDay: 100, sandboxGlobalDay: 2000,
  embedTokensAccountDay: 2_000_000, embedTokensGlobalDay: 20_000_000,
} });
let bot: AnswerBot;
afterAll(async () => { await service.end(); await owner.end(); });

describe('release gate live-store on real PostgreSQL, fake bounded gateway', () => {
  it('service login creates a verified test account and stores ten exact documents/chunks', async () => {
    expect((await service.query('SELECT session_user')).rows[0].session_user).toBe('n6b_app_service');
    expect(await withService(service, async (c) => (await c.query('SELECT current_user')).rows[0].current_user))
      .toBe('n6b_service');
    bot = await createFixture(service);
    expect((await owner.query('SELECT is_test FROM account WHERE id=$1', [bot.accountId])).rows)
      .toEqual([{ is_test: true }]);
    expect(corpus).toHaveLength(10);
    expect(prepared.parts).toHaveLength(10);
    let checkpoints = 0;
    await seedCorpus(service, gateway, bot, prepared, () => { checkpoints += 1; });
    expect(checkpoints).toBe(2);
    expect(provider.calls).toEqual({ embed: 1, answer: 0 });
    const rows = (await owner.query(`SELECT d.id, d.locator_url, d.title, d.text, d.content_sha256,
      c.ord, c.text AS chunk_text, c.text_sha256, c.tokens, vector_dims(c.embedding) AS dimensions,
      s.bot_id, s.account_id, s.kind, s.url
      FROM document d JOIN source s ON s.id=d.source_id JOIN chunk c ON c.document_id=d.id
      WHERE c.bot_id=$1 ORDER BY d.locator_url`, [bot.id])).rows;
    expect(rows).toHaveLength(10);
    expect(new Set(rows.map((r) => r.id)).size).toBe(10);
    for (const { document: d, part } of prepared.parts) {
      expect(rows.find((r) => r.locator_url === d.url)).toMatchObject({
        title: d.title, text: d.text, content_sha256: sha256(d.text), ord: part.ord,
        chunk_text: part.text, text_sha256: part.sha256, tokens: part.tokens, dimensions: 1536,
        bot_id: bot.id, account_id: bot.accountId, kind: 'site', url: 'https://lumen.example.test/site.html',
      });
    }
  });

  it('real vector search excludes a foreign tenant with equally close vectors', async () => {
    const foreign = await createFixture(service);
    await seedCorpus(service, gateway, foreign, prepared, () => undefined);
    const query = (await provider.embed([prepared.texts[0]!], new AbortController().signal)).vectors[0]!;
    const hits = await searchChunks(service, bot.id, query, 5);
    expect(hits).toHaveLength(5);
    expect(hits[0]!.text).toBe(prepared.texts[0]);
    expect(hits[0]!.sim).toBeCloseTo(1, 5);
    const ownIds = (await owner.query('SELECT id FROM chunk WHERE bot_id=$1', [bot.id])).rows.map((r) => r.id);
    expect(hits.every((h) => ownIds.includes(h.id))).toBe(true);
    const foreignHits = await searchChunks(service, foreign.id, query, 5);
    expect(foreignHits).toHaveLength(5);
    expect(foreignHits.every((h) => !ownIds.includes(h.id))).toBe(true);
  });

  it('evidence reads real populated ledgers, scoped by both account and bot; billing stays unknown', async () => {
    const sibling = (await owner.query(`INSERT INTO bot (account_id, public_id, name)
      VALUES ($1, $2, 'sibling') RETURNING id`, [bot.accountId, randomBytes(9).toString('base64url')])).rows[0].id;
    const foreign = await createFixture(service);
    for (const [accountId, botId, tokens] of [[bot.accountId, bot.id, 7],
      [bot.accountId, sibling, 901], [foreign.accountId, foreign.id, 902]] as const) {
      await owner.query(`INSERT INTO model_call_log (account_id, bot_id, kind, state, tokens_in, tokens_out)
        VALUES ($1,$2,'answer','succeeded',$3,3)`, [accountId, botId, tokens]);
      await owner.query(`INSERT INTO question_log (account_id, bot_id, channel, question, outcome)
        VALUES ($1,$2,'sandbox','fixture','answered')`, [accountId, botId]);
    }
    await owner.query(`INSERT INTO quota_counter (scope,day,used) VALUES
      ($1,'2035-01-01',11),($2,'2035-01-01',999),('answer:sandbox:global','2035-01-01',101)`,
    [`answer:sandbox:${bot.accountId}`, `answer:sandbox:${foreign.accountId}`]);
    const evidence = await readEvidence(service, bot);
    const indexTokens = (await owner.query(`SELECT tokens_in FROM model_call_log
      WHERE account_id=$1 AND bot_id=$2 AND kind='embed_index'`, [bot.accountId, bot.id])).rows[0].tokens_in;
    expect(evidence.calls).toHaveLength(2);
    expect(evidence.calls.map((r) => r.kind).sort()).toEqual(['answer', 'embed_index']);
    expect(evidence.tokens_in).toBe(indexTokens + 7);
    expect(evidence.tokens_out).toBe(3);
    expect(evidence.question_logs).toHaveLength(1);
    const expectedId = (await owner.query('SELECT id FROM question_log WHERE account_id=$1 AND bot_id=$2',
      [bot.accountId, bot.id])).rows[0].id;
    expect(evidence.question_logs[0]).toMatchObject({ id: expectedId, outcome: 'answered', cited_chunk_ids: [] });
    const scopes = evidence.quotas.map((r) => r.scope);
    expect(scopes).toContain(`answer:sandbox:${bot.accountId}`);
    expect(scopes).toContain(`embed:account:${bot.accountId}`);
    expect(scopes).toContain('answer:sandbox:global');
    expect(scopes).toContain('embed:global');
    expect(scopes).not.toContain(`answer:sandbox:${foreign.accountId}`);
    expect(scopes).not.toContain(`embed:account:${foreign.accountId}`);
    expect(evidence.cost).toBeNull();
    expect(evidence.cost_reason).toMatch(/No provider billing measurement/);
    await owner.query(`INSERT INTO model_call_log (account_id,bot_id,kind,state)
      VALUES ($1,$2,'answer','started')`, [bot.accountId, bot.id]);
    const incomplete = await readEvidence(service, bot);
    expect(incomplete.tokens_in).toBeNull();
    expect(incomplete.tokens_out).toBeNull();
    expect(incomplete.cost).toBeNull();
  });
});
