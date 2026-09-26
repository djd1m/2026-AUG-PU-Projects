// EmbedAndStore п.1–3 (Pseudocode, FR-INDEX-002, FR-LIMIT-003, NFR-SCALE-001, ADR-001/002/008) — написано
// заново (ADR-016: донора нет). Пачки ≤ 64 фрагмента; КАЖДАЯ попытка пачки идёт через meteredCall:
// пульс+фенс задачи → квота (обычная задача: account_embed_tokens + global_embed_tokens; предпросмотр:
// index_job.embed_budget + global_embed_tokens) одной короткой транзакцией → строка attempt с fsync →
// вызов шлюза → outcome. 2 повтора при 429/5xx/таймауте, каждый — новое списание (счёт по попыткам).
// Запись фрагментов (п.4) — packages/db/src/chunks.ts, writeIndexedPage, в транзакции СТРАНИЦЫ; здесь только
// векторы: сетевой вызов не держит соединение пула.
import { randomUUID } from 'node:crypto';
import { chargeQuota, indexEmbedCharges, previewEmbedCharges, touchAndChargeJobBudgetTx, transaction, type Lease, type Pool } from '@n6/db';
import {
  EMBED_BATCH_MAX, EMBED_RETRIES, GatewayResponseError, RetryableCallError, embeddingInput, estimateTokens, isEmbeddingOfDimension,
  meteredCall, type Ceilings, type ChargeDecision, type Chunk, type OpenRouter, type SpendRecorder,
} from '@n6/rag';
import { StepFailure } from '../run-index-job';

export interface EmbedderOptions {
  pool: Pool; client: Pick<OpenRouter, 'embed'>; ceilings: Ceilings; spend: SpendRecorder; embedModel: string;
  retryPauseMs?: number; log?: (line: string) => void;
}
export interface Embedder { embed(lease: Lease, chunks: readonly Chunk[]): Promise<number[][]> }
type Payer = { kind: 'preview' } | { kind: 'account'; accountId: string };

export function createEmbedder(options: EmbedderOptions): Embedder {
  const { pool } = options;
  const log = options.log ?? ((line: string) => console.error(line));

  // Кто платит: предпросмотр — бюджет задачи (у черновика нет аккаунта); иначе — аккаунт владельца бота.
  // Бот без аккаунта и без бюджета — не «бесплатно», а internal (fail-closed).
  async function payerOf(lease: Lease): Promise<Payer> {
    if (lease.embedBudget !== null) return { kind: 'preview' };
    const row = await pool.query<{ account_id: string | null }>('SELECT account_id FROM bot WHERE id = $1', [lease.botId]);
    const accountId = row.rows[0]?.account_id;
    if (!accountId) { log(`worker-index: задача ${lease.indexJobId}: у бота нет аккаунта и у задачи нет бюджета — эмбеддинги не оплачиваются`); throw new StepFailure('internal'); }
    return { kind: 'account', accountId };
  }

  // Одна короткая транзакция на попытку: фенс (опоздавшая попытка не платит) → бюджет задачи → quota_counter.
  // Отказ любого предела откатывает ВСЕ списания этой попытки. Сутки — по часам БД, а не процесса.
  const charge = (lease: Lease, payer: Payer, tokens: number): Promise<ChargeDecision> => transaction(pool, async (tx) => {
    await tx.query('SAVEPOINT embed_charge');
    const job = await touchAndChargeJobBudgetTx(tx, lease, tokens);
    let refused: string | null = job.granted ? null : 'index_job.embed_budget';
    if (!refused) {
      const now = (await tx.query<{ now: Date }>('SELECT now() AS now')).rows[0]!.now;
      const charges = payer.kind === 'preview' ? previewEmbedCharges(options.ceilings, { tokens, now })
        : indexEmbedCharges(options.ceilings, { accountId: payer.accountId, tokens, now });
      const decision = await chargeQuota(tx, charges);
      if (!decision.granted) refused = decision.scope;
    }
    if (refused) { await tx.query('ROLLBACK TO SAVEPOINT embed_charge'); await tx.query('RELEASE SAVEPOINT embed_charge'); return { granted: false, scope: refused }; }
    await tx.query('RELEASE SAVEPOINT embed_charge');
    return { granted: true };
  });

  async function embedBatch(lease: Lease, payer: Payer, batch: readonly Chunk[]): Promise<number[][]> {
    const texts = batch.map(embeddingInput);
    const tokens = texts.reduce((n, text) => n + estimateTokens(text), 0);
    let result;
    try {
      result = await meteredCall({
        charge: () => charge(lease, payer, tokens),
        spend: options.spend,
        event: { call: payer.kind === 'preview' ? 'embed_preview' : 'embed_index', model: options.embedModel, request_id: randomUUID(),
          bot_id: lease.botId, index_job_id: lease.indexJobId, ...(payer.kind === 'account' ? { account_id: payer.accountId } : {}),
          unit: 'tokens', quantity: tokens },
        retries: EMBED_RETRIES, pauseMs: options.retryPauseMs ?? 1000,
        run: async () => {
          const { vectors, tokens: actual } = await options.client.embed({ texts });
          // Вторая проверка ПОСЛЕ клиента (ADR-001): клиент может быть подменён или ослаблен; outcome попытки
          // обязан назвать dimension_mismatch, а не success с отказом записи позже.
          if (vectors.length !== texts.length || !vectors.every((v) => isEmbeddingOfDimension(v))) {
            throw new GatewayResponseError('dimension_mismatch', 'Эмбеддинги: число или длина векторов не совпали с 1536');
          }
          return { value: vectors, tokens: actual };
        },
      });
    } catch (error) {
      if (error instanceof RetryableCallError) {
        log(`worker-index: задача ${lease.indexJobId}: шлюз эмбеддингов недоступен после ${EMBED_RETRIES + 1} попыток (${error.result})`);
        throw new StepFailure('embedding_unavailable', true);
      }
      if (error instanceof GatewayResponseError) {
        if (error.spendResult === 'dimension_mismatch') {
          log(`worker-index: СИГНАЛ ОПЕРАТОРУ — задача ${lease.indexJobId}: вектор эмбеддинга не 1536 измерений; запись фрагментов остановлена`);
          throw new StepFailure('internal');
        }
        log(`worker-index: задача ${lease.indexJobId}: шлюз эмбеддингов отказал (${error.spendResult})`);
        throw new StepFailure('embedding_unavailable');
      }
      throw error; // StaleAttemptError и дефекты — как есть
    }
    if (result.status === 'refused') {
      log(`worker-index: задача ${lease.indexJobId}: эмбеддинги отклонены пределом ${result.scope.split(':')[0]}`);
      throw new StepFailure('quota_refused');
    }
    return result.value;
  }

  return {
    async embed(lease, chunks) {
      if (!chunks.length) return [];
      const payer = await payerOf(lease);
      const vectors: number[][] = [];
      for (let from = 0; from < chunks.length; from += EMBED_BATCH_MAX) {
        vectors.push(...await embedBatch(lease, payer, chunks.slice(from, from + EMBED_BATCH_MAX)));
      }
      return vectors;
    },
  };
}
