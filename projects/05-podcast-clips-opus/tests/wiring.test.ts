import { describe, expect, it } from 'vitest';
import { cpSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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
  it('Новая обязательная переменная config.ts не теряется в environment.ts', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'n5-config-wiring-'));
    try {
      for (const folder of ['apps/web/src', 'apps/worker', 'packages/shared/src', 'packages/queue/src']) {
        cpSync(folder, path.join(dir, folder), { recursive: true });
      }
      cpSync('packages/db/src', path.join(dir, 'packages/db/src'), { recursive: true });
      cpSync('packages/s3/src', path.join(dir, 'packages/s3/src'), { recursive: true });
      const file = path.join(dir, 'packages/shared/src/config.ts');
      const source = readFileSync(file, 'utf8');
      writeFileSync(file, source.replace('const limits = loadLimits(env);', "required(env, 'N5_TEST_UNWIRED', 'storage unavailable'); const limits = loadLimits(env);"));
      expect(checkWiring(compose(), dir)).toContain('web environment.ts: N5_TEST_UNWIRED');
      expect(checkWiring(compose(), dir)).toContain('web: N5_TEST_UNWIRED');
      writeFileSync(file, source);
      expect(checkWiring(compose(), dir)).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
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
