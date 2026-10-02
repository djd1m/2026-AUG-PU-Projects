// Шаг «нарезать и эмбеддить» задачи индексации (Pseudocode «Chunk and embed» шаги 1–7; FR-n6b-4, FR-n6b-16, SC-US-017-2).
// Вход — документы источника, уже извлечённые обходом сайта или PDF (фичи crawl-site, pdf-source).
//
// Деньги — ТОЛЬКО через дверь PaidGateway.embedIndexBatch: резерв embed:account и embed:global атомарно ДО вызова, счёт
// по попыткам (spend-ceilings). Повтор не платит: части с уже записанным (document_id, text_sha256) не эмбеддятся и не
// резервируются вовсе. Работа идёт вне транзакции; каждая запись — короткая транзакция под fence задачи: исполнитель,
// у которого забрали аренду, не пишет ни одной строки (JobLeaseLost).

import { type Pool, type PoolClient, withService } from '@n6b/db';
import { checkVectors, minBatchTokens, type PaidGateway, splitIntoChunksAsync, type TextPart, vectorLiteral } from '@n6b/rag';
import type { LeasedJob } from './lease.js';
import { type JobContext, JobLeaseLost } from './runner.js';

/** Частей на один вызов эмбеддингов (Pseudocode шаг 3: «≤ 100 на вызов»). */
export const EMBED_BATCH_MAX = 100;

export interface ChunkEmbedDeps {
  readonly pool: Pool;
  readonly gateway: PaidGateway;
  readonly batchSize?: number;
}

export interface ChunkEmbedReport {
  readonly documents: number;
  readonly parts: number;
  /** Части, для которых был платный вызов (новые или изменённые). */
  readonly embedded: number;
  readonly calls: number;
  /** Удалённые части, чьего хэша в документе больше нет (страница изменилась, шаг 7). */
  readonly removed: number;
}

interface Pending extends TextPart { readonly documentId: string }

/** Оценка токенов батча для резерва: точная (js-tiktoken), но не ниже нижней границы двери ⌈Σ длин / 4⌉. */
export function batchTokens(parts: readonly TextPart[]): number {
  const exact = parts.reduce((s, p) => s + p.tokens, 0);
  return Math.max(exact, minBatchTokens(parts.map((p) => p.text)));
}

/** Строка задачи всё ещё наша (тот же fence, running): иначе — JobLeaseLost, запись не делается. */
async function holdLease(c: PoolClient, job: Pick<LeasedJob, 'id' | 'fence'>): Promise<void> {
  const r = await c.query(`SELECT 1 FROM index_job WHERE id = $1 AND lease_fence = $2 AND state = 'running' FOR SHARE`,
    [job.id, job.fence]);
  if (r.rowCount !== 1) throw new JobLeaseLost();
}

const INSERT_SQL = `
  INSERT INTO chunk (document_id, bot_id, account_id, ord, text, text_sha256, tokens, embedding)
  SELECT x.d, $1, $2, x.o, x.t, x.h, x.k, x.v::vector
  FROM unnest($3::uuid[], $4::int[], $5::text[], $6::text[], $7::int[], $8::text[]) AS x(d, o, t, h, k, v)
  ON CONFLICT (document_id, text_sha256) DO NOTHING`;

export async function chunkAndEmbedSource(ctx: JobContext, deps: ChunkEmbedDeps): Promise<ChunkEmbedReport> {
  const { job } = ctx;
  const size = deps.batchSize ?? EMBED_BATCH_MAX;
  if (!Number.isSafeInteger(size) || size < 1 || size > EMBED_BATCH_MAX) throw new Error(`размер батча вне 1…${EMBED_BATCH_MAX}`);

  // Шаг 1–2: документы источника и уже записанные хэши. Служебная роль — изоляция явным WHERE по account_id.
  const { botId, docs, existing } = await withService(deps.pool, async (c) => {
    const src = (await c.query<{ bot_id: string }>('SELECT bot_id FROM source WHERE id = $1 AND account_id = $2',
      [job.sourceId, job.accountId])).rows[0];
    if (!src) throw new Error('источник задачи не найден');
    const d = (await c.query<{ id: string; text: string }>(
      'SELECT id, text FROM document WHERE source_id = $1 AND account_id = $2 ORDER BY created_at, id',
      [job.sourceId, job.accountId])).rows;
    const e = (await c.query<{ document_id: string; text_sha256: string }>(
      'SELECT document_id, text_sha256 FROM chunk WHERE document_id = ANY ($1::uuid[]) AND account_id = $2',
      [d.map((x) => x.id), job.accountId])).rows;
    return { botId: src.bot_id, docs: d, existing: new Set(e.map((x) => `${x.document_id}:${x.text_sha256}`)) };
  });

  const pending: Pending[] = [];
  const keep = new Map<string, string[]>();
  let parts = 0;
  for (const doc of docs) {
    const split = await splitIntoChunksAsync(doc.text, () => ctx.checkpoint());
    parts += split.length;
    keep.set(doc.id, split.map((p) => p.sha256));
    for (const p of split) if (!existing.has(`${doc.id}:${p.sha256}`)) pending.push({ ...p, documentId: doc.id });
  }

  // Шаги 3–6: батчи новых частей. Контрольная точка до резерва и после записи (Worker lease loop шаг 6).
  let calls = 0;
  for (let i = 0; i < pending.length; i += size) {
    const batch = pending.slice(i, i + size);
    await ctx.checkpoint();
    const texts = batch.map((p) => p.text);
    const result = await deps.gateway.embedIndexBatch(job.accountId, { accountId: job.accountId, botId }, texts,
      batchTokens(batch));
    calls += 1;
    const vectors = checkVectors(result.vectors, batch.length).map(vectorLiteral);
    await withService(deps.pool, async (c) => {
      await holdLease(c, job);
      await c.query(INSERT_SQL, [botId, job.accountId, batch.map((p) => p.documentId), batch.map((p) => p.ord),
        texts, batch.map((p) => p.sha256), batch.map((p) => p.tokens), vectors]);
    });
    await ctx.checkpoint();
  }

  // Шаг 7: части, чьего хэша в документе больше нет, удаляются — только после того, как все новые записаны.
  let removed = 0;
  if (docs.length > 0) {
    removed = await withService(deps.pool, async (c) => {
      await holdLease(c, job);
      let n = 0;
      for (const [documentId, hashes] of keep) {
        const r = await c.query('DELETE FROM chunk WHERE document_id = $1 AND account_id = $2 AND NOT (text_sha256 = ANY ($3::text[]))',
          [documentId, job.accountId, hashes]);
        n += r.rowCount ?? 0;
      }
      return n;
    });
  }
  return { documents: docs.length, parts, embedded: pending.length, calls, removed };
}
