import { randomBytes } from 'node:crypto';
import { type AnswerBot, type Pool, withService } from '@n6b/db';
import { type PaidGateway, countTokens, minBatchTokens, sha256, splitIntoChunks, vectorLiteral } from '@n6b/rag';
import type { CorpusDocument } from './evaluate.js';

export function prepareCorpus(corpus: readonly CorpusDocument[]) {
  if (corpus.reduce((n, d) => n + Buffer.byteLength(d.text, 'utf8'), 0) > 32_000) {
    throw new Error('corpus_budget_exceeded');
  }
  const parts = corpus.flatMap((d) => splitIntoChunks(d.text).map((part) => ({ document: d, part })));
  const texts = parts.map((p) => p.part.text);
  const tokenEstimate = Math.max(minBatchTokens(texts), texts.reduce((sum, t) => sum + countTokens(t), 0));
  const bytes = texts.reduce((sum, t) => sum + Buffer.byteLength(t, 'utf8'), 0);
  if (!texts.length || texts.length > 20 || bytes > 32_000 || tokenEstimate > 8000) {
    throw new Error('corpus_budget_exceeded');
  }
  return { parts, texts, tokenEstimate, bytes };
}

export async function createFixture(pool: Pool): Promise<AnswerBot> {
  return withService(pool, async (c) => {
    const account = (await c.query<{ id: string }>('INSERT INTO account (is_test) VALUES (true) RETURNING id')).rows[0]!;
    const bot = (await c.query<{ id: string }>(`INSERT INTO bot (account_id, public_id, name, contact)
      VALUES ($1, $2, 'F16 frozen seeded fixture', 'fixture@example.test') RETURNING id`,
    [account.id, randomBytes(9).toString('base64url')])).rows[0]!;
    const test = (await c.query<{ is_test: boolean }>('SELECT is_test FROM account WHERE id = $1', [account.id])).rows[0];
    if (test?.is_test !== true) throw new Error('test_account_not_verified');
    return { id: bot.id, accountId: account.id, contact: 'fixture@example.test' };
  });
}

export async function seedCorpus(pool: Pool, gateway: PaidGateway, bot: AnswerBot,
  prepared: ReturnType<typeof prepareCorpus>, checkpoint: () => void): Promise<void> {
  checkpoint();
  const vectors = await gateway.embedIndexBatch(bot.accountId, { accountId: bot.accountId, botId: bot.id },
    prepared.texts, prepared.tokenEstimate);
  checkpoint();
  await withService(pool, async (c) => {
    const source = (await c.query<{ id: string }>(`INSERT INTO source (bot_id, account_id, kind, url)
      VALUES ($1, $2, 'site', 'https://lumen.example.test/site.html') RETURNING id`, [bot.id, bot.accountId])).rows[0]!;
    const documents = new Map<string, string>();
    for (const [i, { document: d, part }] of prepared.parts.entries()) {
      let docId = documents.get(d.key);
      if (!docId) {
        docId = (await c.query<{ id: string }>(`INSERT INTO document
          (source_id, account_id, locator_url, title, text, content_sha256)
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [source.id, bot.accountId, d.url, d.title, d.text, sha256(d.text)])).rows[0]!.id;
        documents.set(d.key, docId);
      }
      await c.query(`INSERT INTO chunk (document_id, bot_id, account_id, ord, text, text_sha256, tokens, embedding)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)`,
      [docId, bot.id, bot.accountId, part.ord, part.text, part.sha256, part.tokens, vectorLiteral(vectors.vectors[i]!)]);
    }
  });
}

export async function readEvidence(pool: Pool, bot: AnswerBot) {
  return withService(pool, async (c) => {
    const calls = (await c.query<{ id: string; kind: string; state: string; tokens_in: number | null; tokens_out: number | null }>(
      `SELECT id, kind, state, tokens_in, tokens_out, created_at FROM model_call_log
       WHERE account_id = $1 AND bot_id = $2 ORDER BY created_at, id`, [bot.accountId, bot.id])).rows;
    const quotas = (await c.query(`SELECT scope, day, used FROM quota_counter WHERE scope = ANY($1::text[]) ORDER BY day, scope`,
      [[`answer:sandbox:${bot.accountId}`, `embed:account:${bot.accountId}`, 'answer:sandbox:global', 'embed:global']])).rows;
    const questionLogs = (await c.query(`SELECT id, outcome, cited_chunk_ids FROM question_log
      WHERE account_id = $1 AND bot_id = $2 ORDER BY created_at, id`, [bot.accountId, bot.id])).rows;
    const sum = (field: 'tokens_in' | 'tokens_out') => {
      const relevant = field === 'tokens_out' ? calls.filter((r) => r.kind === 'answer') : calls;
      return relevant.length && relevant.every((r) => r[field] !== null)
        ? relevant.reduce((n, r) => n + r[field]!, 0) : null;
    };
    return { calls, quotas, question_logs: questionLogs, tokens_in: sum('tokens_in'), tokens_out: sum('tokens_out'),
      cost: null, cost_reason: 'No provider billing measurement; global quota rows may include concurrent work' };
  });
}
