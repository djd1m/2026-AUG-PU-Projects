// Написано заново по форме N5 apps/worker/src/llm/provider.ts (роадмап quota-and-spend): пробный вызов
// ANSWER_MODEL при старте web — через meteredCall (attempt с fsync ДО вызова). Ответ ≠ 200 или ответ
// без JSON-схемы (structured outputs, ADR-011) валит старт: иначе первый посетитель узнал бы об этом сам.
import { randomUUID } from 'node:crypto';
import { createOpenRouter, meteredCall, moscowDay, prepareSpendDirectory, reserveProbe, spendRecorder, type ModelConfig } from '@n6/rag';

const PROBE_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
export async function answerProbe(models: ModelConfig, spendLog: string, request: typeof fetch = fetch): Promise<void> {
  prepareSpendDirectory(spendLog);
  reserveProbe(spendLog, 'answer', moscowDay(new Date()));
  const client = createOpenRouter(models, request);
  const result = await meteredCall({
    spend: spendRecorder(spendLog),
    event: { call: 'probe_answer', model: models.answerModel, request_id: randomUUID(), unit: 'calls', quantity: 1 },
    run: async () => client.complete({ schemaName: 'probe', schema: PROBE_SCHEMA, maxTokens: 16,
      messages: [{ role: 'system', content: 'Ответь JSON {"ok": true}.' }, { role: 'user', content: 'проба' }] }),
  });
  const value = result.status === 'ok' ? result.value : undefined;
  if (!value || typeof value !== 'object' || !('ok' in value) || typeof value.ok !== 'boolean') {
    throw new Error('проба ANSWER_MODEL: ответ не соответствует JSON-схеме');
  }
}
