import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkWiring, collectEnvironment } from '../scripts/check-env-wiring.mjs';
import { environment } from './fixtures/environment';

describe('Проверяемость проброса окружения', () => {
  const compose = () => ({ services: Object.fromEntries(['web', 'worker-stt', 'worker-llm', 'worker-video'].map((name) => [name, { environment: environment() }])) });
  it('Полная конфигурация проходит, отсутствие потолка даёт находку', () => {
    const config = compose(); expect(checkWiring(config)).toEqual([]);
    delete config.services.web!.environment.N5_LIMIT_USER_UPLOAD_REFUNDS;
    expect(checkWiring(config)).toEqual(['web: N5_LIMIT_USER_UPLOAD_REFUNDS']);
  });
  it('Соседнему воркеру не приписываются переменные web', () => {
    const config = compose();
    for (const name of ['worker-stt', 'worker-llm', 'worker-video']) delete config.services[name]!.environment.SESSION_SECRET;
    delete config.services['worker-stt']!.environment.N5_PUBLIC_ORIGIN;
    delete config.services['worker-llm']!.environment.N5_PUBLIC_ORIGIN;
    expect(checkWiring(config)).toEqual([]);
  });
  it('Пустой или неполный compose не зеленеет', () => {
    expect(() => checkWiring({})).toThrow(); expect(() => checkWiring({ services: {} })).toThrow();
  });
  it('S3_ENDPOINT не режется до S; динамическое чтение не пропускается', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'n5-wiring-'));
    try {
      mkdirSync(path.join(dir, 'src'));
      writeFileSync(path.join(dir, 'src/env.ts'), 'export const endpoint = process.env.S3_ENDPOINT;');
      expect([...collectEnvironment(['src/env.ts'], dir)]).toEqual(['S3_ENDPOINT']);
      writeFileSync(path.join(dir, 'src/env.ts'), 'export const endpoint = process.env[key];');
      expect(() => collectEnvironment(['src/env.ts'], dir)).toThrow('Динамическое');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
