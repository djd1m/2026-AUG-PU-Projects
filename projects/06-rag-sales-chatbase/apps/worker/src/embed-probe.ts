// Написано заново (у N5 нет эмбеддингов): EmbedProbe — FR-INDEX-002, ADR-001/002. Форма вызова — через
// meteredCall (@n6/rag/spend, донор N5 spend.ts): строка attempt с fsync ДО вызова, outcome после.
// Ответ ≠ 200 или длина вектора ≠ 1536 валит старт worker-index: другая размерность — миграция колонки
// и переиндексация, а не «почти подходит».
import { randomUUID } from 'node:crypto';
import { EMBED_DIMENSIONS, createOpenRouter, meteredCall, moscowDay, prepareSpendDirectory, reserveProbe, spendRecorder, type ModelConfig } from '@n6/rag';

export async function embedProbe(models: ModelConfig, spendLog: string, request: typeof fetch = fetch): Promise<number> {
  prepareSpendDirectory(spendLog);
  reserveProbe(spendLog, 'embed', moscowDay(new Date()));
  const client = createOpenRouter(models, request);
  const result = await meteredCall({
    spend: spendRecorder(spendLog),
    event: { call: 'probe_embed', model: models.embedModel, request_id: randomUUID(), unit: 'tokens', quantity: 2 },
    run: async () => { const { vectors, tokens } = await client.embed({ texts: ['проба'] }); return { value: vectors[0]!.length, tokens }; },
  });
  if (result.status !== 'ok' || result.value !== EMBED_DIMENSIONS) throw new Error(`EmbedProbe: размерность ≠ ${EMBED_DIMENSIONS}`);
  return result.value;
}
