// RecordModelSpend + meteredCall (NFR-OPS-001, model-call-cost п.4): счёт по ПОПЫТКАМ. Форма записи —
// донор N5 apps/worker/src/llm/spend.ts; порядок «квота → attempt(fsync) → вызов → outcome» — N6.
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PROBE_DAILY_LIMIT, RetryableCallError, meteredCall, reserveProbe, spendRecorder, validateSpendPath, type SpendEvent } from '../packages/rag/src/spend';
import { GatewayResponseError } from '../packages/rag/src/openrouter';

const journal = () => path.join(mkdtempSync(path.join(tmpdir(), 'n6-spend-')), 'model-spend.jsonl');
const lines = (file: string): SpendEvent[] => existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as SpendEvent) : [];
const event = { call: 'answer' as const, model: 'anthropic/claude-haiku-4.5', request_id: 'r1', unit: 'calls' as const, quantity: 1 };

describe('Журнал попыток: attempt с fsync ДО вызова', () => {
  it('в момент вызова строка attempt уже на диске; после — outcome success', async () => {
    const file = journal();
    let seenAtCall: SpendEvent[] = [];
    const result = await meteredCall({ spend: spendRecorder(file), event, run: async () => { seenAtCall = lines(file); return { value: 'ok', tokens: 24 }; } });
    expect(result).toEqual({ status: 'ok', value: 'ok', attempts: 1 });
    expect(seenAtCall.map((l) => [l.phase, l.result])).toEqual([['attempt', 'started']]);
    expect(lines(file).map((l) => [l.phase, l.result, l.attempt_no])).toEqual([['attempt', 'started', 1], ['outcome', 'success', 1]]);
    expect(lines(file)[1]!.tokens_actual).toBe(24);
  });
  it('отказ модели: попытка учтена, списание НЕ возвращено, ошибка не проглочена', async () => {
    const file = journal(); let charges = 0;
    await expect(meteredCall({ spend: spendRecorder(file), event, charge: async () => { charges++; return { granted: true }; },
      run: async () => { throw new GatewayResponseError('schema_violation', 'мусор'); } })).rejects.toThrow('мусор');
    expect(charges).toBe(1);
    expect(lines(file).map((l) => [l.phase, l.result])).toEqual([['attempt', 'started'], ['outcome', 'schema_violation']]);
  });
  it('повтор после 503 — НОВАЯ попытка: новое списание и новая строка attempt (3 из 3)', async () => {
    const file = journal(); let charges = 0, calls = 0;
    await expect(meteredCall({ spend: spendRecorder(file), event, retries: 2, pauseMs: 1,
      charge: async () => { charges++; return { granted: true }; },
      run: async () => { calls++; throw new RetryableCallError('provider_error', '503'); } })).rejects.toThrow('503');
    expect([charges, calls]).toEqual([3, 3]);
    expect(lines(file).filter((l) => l.phase === 'attempt').map((l) => l.attempt_no)).toEqual([1, 2, 3]);
  });
  it('квота отказала — ни вызова, ни строки attempt; отказ назван scope', async () => {
    const file = journal(); let calls = 0;
    const result = await meteredCall({ spend: spendRecorder(file), event, charge: async () => ({ granted: false, scope: 'visitor_answers' }),
      run: async () => { calls++; return { value: 1 }; } });
    expect(result).toEqual({ status: 'refused', scope: 'visitor_answers', attempts: 0 });
    expect(calls).toBe(0); expect(lines(file)).toEqual([]);
  });
  it('повтор упёрся в квоту: оплачено ровно столько попыток, сколько списано', async () => {
    const file = journal(); let left = 2, calls = 0;
    const result = await meteredCall({ spend: spendRecorder(file), event, retries: 5, pauseMs: 1,
      charge: async () => (left-- > 0 ? { granted: true } : { granted: false, scope: 'visitor_answers' }),
      run: async () => { calls++; throw new RetryableCallError('rate_limited', '429'); } });
    expect(result).toEqual({ status: 'refused', scope: 'visitor_answers', attempts: 2 });
    expect(calls).toBe(2);
    expect(lines(file).filter((l) => l.phase === 'attempt')).toHaveLength(2);
  });
  it('нет учёта — нет траты: журнал недоступен → вызов не выполняется', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'n6-spend-'));
    mkdirSync(path.join(dir, 'model-spend.jsonl')); // каталог на месте файла — запись невозможна
    let calls = 0;
    await expect(meteredCall({ spend: spendRecorder(path.join(dir, 'model-spend.jsonl')), event, run: async () => { calls++; return { value: 1 }; } })).rejects.toThrow();
    expect(calls).toBe(0);
  });
  it('N6_SPEND_LOG: относительный путь, не .jsonl — отказ', () => {
    for (const bad of ['spend.jsonl', '/work/spend/model-spend.json', '/x/\n.jsonl']) expect(() => validateSpendPath(bad)).toThrow('N6_SPEND_LOG непригодна');
    expect(validateSpendPath('/work/spend/model-spend.jsonl')).toBe('/work/spend/model-spend.jsonl');
  });
});

describe('Пробы старта ограничены числом в сутки (свой-код)', () => {
  it(`${PROBE_DAILY_LIMIT} проб проходят, ${PROBE_DAILY_LIMIT + 1}-я — отказ с объяснением; другой вид и другие сутки — свой счёт`, () => {
    const file = journal();
    for (let i = 1; i <= PROBE_DAILY_LIMIT; i++) expect(reserveProbe(file, 'embed', '2026-09-25')).toBe(i);
    expect(() => reserveProbe(file, 'embed', '2026-09-25')).toThrow('перезапуск по кругу');
    expect(reserveProbe(file, 'answer', '2026-09-25')).toBe(1);
    expect(reserveProbe(file, 'embed', '2026-09-26')).toBe(1);
  });
});
