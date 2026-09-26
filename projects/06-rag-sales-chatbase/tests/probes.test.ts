// EmbedProbe (FR-INDEX-002, ADR-001/002) и проба ANSWER_MODEL (ADR-011): настоящие собранные процессы
// worker-index и web (dist / .next/preflight) против подменного шлюза. Ответ ≠ 200, длина ≠ 1536 или
// ответ без JSON-схемы валит старт с кодом 1; каждая проба — строка attempt в журнале ДО вызова.
// Сборку выполняет beforeAll tests/config.test.ts; здесь — своя, чтобы файл был самодостаточен.
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { environment } from './fixtures/environment';
import { subprocess } from './fixtures/subprocess';

const FAKE = ['--import', './tests/fixtures/fake-gateway.mjs'];
const WEB = [...FAKE, 'apps/web/.next/preflight/preflight.js'];
const WORKER = [...FAKE, 'apps/worker/dist/index.js'];
beforeAll(() => {
  // db и queue — до воркера: он импортирует их типы из dist (копия проекта в мутационных прогонах собирается без dist).
  for (const project of ['packages/rag/tsconfig.json', 'packages/db/tsconfig.json', 'packages/queue/tsconfig.json', 'apps/worker/tsconfig.json', 'apps/web/tsconfig.preflight.json']) {
    const result = subprocess(['node_modules/typescript/bin/tsc', '-p', project], process.env, 60000);
    expect(result.status, result.output).toBe(0);
  }
});
function run(entry: string[], mode: string, timeout = 3000) {
  const env = environment();
  const log = path.join(mkdtempSync(path.join(tmpdir(), 'n6-gw-')), 'requests.jsonl');
  const result = subprocess(entry, { ...env, FAKE_GATEWAY: mode, FAKE_GATEWAY_LOG: log }, timeout);
  const requests = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { path: string; body: Record<string, unknown> }) : [];
  const spend = existsSync(env.N6_SPEND_LOG!) ? readFileSync(env.N6_SPEND_LOG!, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>) : [];
  return { ...result, requests, spend };
}

describe('EmbedProbe при старте worker-index', () => {
  it('шлюз отвечает 1536 — процесс живёт; запрос с dimensions 1536; attempt → outcome success в журнале', () => {
    const result = run(WORKER, 'ok');
    expect(result.timedOut, result.output).toBe(true);
    expect(result.output).toContain('EmbedProbe: 1536 измерений');
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({ path: '/embeddings', body: { model: 'openai/text-embedding-3-small', dimensions: 1536 } });
    expect(result.spend.map((l) => [l.call, l.phase, l.result])).toEqual([['probe_embed', 'attempt', 'started'], ['probe_embed', 'outcome', 'success']]);
  });
  it('длина вектора 1535 — код 1, dimension_mismatch в журнале', () => {
    const result = run(WORKER, 'dim1535');
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('worker-index не запущен');
    expect(result.output).toContain('1535 ≠ 1536');
    expect(result.spend.map((l) => [l.phase, l.result])).toEqual([['attempt', 'started'], ['outcome', 'dimension_mismatch']]);
  });
  it('шлюз 500 — код 1; попытка учтена', () => {
    const result = run(WORKER, '500');
    expect(result.status, result.output).toBe(1);
    expect(result.spend.filter((l) => l.phase === 'attempt')).toHaveLength(1);
  });
});

describe('Проба ANSWER_MODEL при старте web (preflight)', () => {
  it('ответ по JSON-схеме — код 0; запрос несёт response_format, temperature 0 и модель канона', () => {
    const result = run(WEB, 'ok');
    expect(result.status, result.output).toBe(0);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({ path: '/chat/completions', body: { model: 'anthropic/claude-haiku-4.5', temperature: 0,
      response_format: { type: 'json_schema' } } });
    expect(result.spend.map((l) => [l.call, l.phase, l.result])).toEqual([['probe_answer', 'attempt', 'started'], ['probe_answer', 'outcome', 'success']]);
  });
  it.each(['500', 'noschema'])('шлюз «%s» — код 1 и «web не запущен»', (mode) => {
    const result = run(WEB, mode);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('web не запущен');
  });
});
