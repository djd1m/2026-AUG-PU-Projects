import { describe, expect, it, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LIMIT_NAMES, loadWebConfig, loadWorkerConfig } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';

function subprocess(args: string[], env: NodeJS.ProcessEnv = process.env) {
  const dir = mkdtempSync(path.join(tmpdir(), 'n5-config-'));
  const file = path.join(dir, 'output');
  const fd = openSync(file, 'w');
  try {
    // Файловые дескрипторы работают и в среде, где синхронные pipe запрещены.
    const result = spawnSync(process.execPath, args, { env, stdio: ['ignore', fd, fd], timeout: 15000 });
    if (result.error) throw result.error;
    return { status: result.status, stderr: readFileSync(file, 'utf8') };
  } finally { closeSync(fd); rmSync(dir, { recursive: true, force: true }); }
}
beforeAll(() => {
  expect(subprocess(['node_modules/typescript/bin/tsc', '-p', 'packages/shared/tsconfig.json']).status).toBe(0);
});
describe('Отказ запуска конфигурации', () => {
  for (const name of LIMIT_NAMES) {
    it(`Отдельный процесс без ${name}`, () => {
      const env = environment(); delete env[name];
      const result = subprocess(['-e', "require('./packages/shared/dist/config.js').loadWebConfig(process.env)"], env);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(name);
      expect(result.stderr).toMatch(/вызов|выдача загрузки|скачивание и ffprobe|смена музыки/);
    });
  }
  it('Седьмой процесс: пустой origin', () => {
    const result = subprocess(['-e', "require('./packages/shared/dist/config.js').loadWebConfig(process.env)"], { ...environment(), N5_PUBLIC_ORIGIN: '' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('пустая строка');
    expect(result.stderr).toContain('метку каждого клипа');
  });
  it('Старт web без S3_PUBLIC_ENDPOINT отказывает с последствием для браузера', () => {
    const env = environment(); delete env.S3_PUBLIC_ENDPOINT;
    const result = subprocess(['-e', "require('./packages/shared/dist/config.js').loadWebConfig(process.env)"], env);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('S3_PUBLIC_ENDPOINT');
    expect(result.stderr).toContain('браузер');
  });
  it.each(['production', undefined, 'staging'])('S3_PUBLIC_ENDPOINT требует HTTPS вне development/test: %s', (mode) => {
    expect(() => loadWebConfig({ ...environment(), NODE_ENV: mode, S3_PUBLIC_ENDPOINT: 'http://storage.test.invalid' })).toThrow('S3_PUBLIC_ENDPOINT');
  });
  it.each(['', ' ', 'ftp://storage.test.invalid', 'https://u:p@storage.test.invalid', 'https://storage.test.invalid/bucket',
    'https://storage.test.invalid/?q=1', 'https://storage.test.invalid/#x', ' https://storage.test.invalid', 'https://stor\tage.test.invalid'])('S3_PUBLIC_ENDPOINT отвергает непригодный адрес: %s', (endpoint) => {
    expect(() => loadWebConfig({ ...environment(), S3_PUBLIC_ENDPOINT: endpoint })).toThrow('S3_PUBLIC_ENDPOINT');
  });
  it.each(['DATABASE_URL', 'REDIS_URL', 'SESSION_SECRET', 'N5_PUBLIC_ORIGIN'])( '%s обязателен', (name) => {
    const env = environment(); delete env[name]; expect(() => loadWebConfig(env)).toThrow(`${name} отсутствует`);
    env[name] = ''; expect(() => loadWebConfig(env)).toThrow(`${name} пустая строка`);
  });
  it.each(['0', '-1', '1.5', '2x', '1e2', ' 2', 'Infinity', '2147483648'])('Отказ непригодного потолка %s', (raw) => {
    expect(() => loadWebConfig({ ...environment(), N5_LIMIT_USER_LLM: raw })).toThrow('N5_LIMIT_USER_LLM непригодно');
  });
  it.each(['ftp://test.invalid', 'https://test.invalid/path', 'https://u:p@test.invalid', ' https://test.invalid', 'https://test.invalid/?q=1'])('Origin не подчищается: %s', (origin) => {
    expect(() => loadWebConfig({ ...environment(), N5_PUBLIC_ORIGIN: origin })).toThrow('N5_PUBLIC_ORIGIN непригодно');
  });
  it('http разрешён только в development/test', () => {
    expect(() => loadWebConfig({ ...environment(), NODE_ENV: 'production', N5_PUBLIC_ORIGIN: 'http://test.invalid' })).toThrow();
    expect(loadWebConfig({ ...environment(), NODE_ENV: 'development', N5_PUBLIC_ORIGIN: 'http://test.invalid' }).publicOrigin).toBe('http://test.invalid');
  });
  it('Воркеры не требуют чужой секрет сессий', () => {
    const env = environment(); delete env.SESSION_SECRET;
    expect(loadWorkerConfig('worker-stt', env).role).toBe('worker-stt');
    expect(loadWorkerConfig('worker-llm', env).role).toBe('worker-llm');
    expect(loadWorkerConfig('worker-video', env).role).toBe('worker-video');
  });
});

for (const role of ['worker-stt', 'worker-llm'] as const) {
  it.each([undefined, '', 'https://test.invalid/path', 'https://' + 'x'.repeat(100) + '.com'])(
    `SL-007 ${role} refuses unusable origin %s before paid work`, origin => {
      const env = { ...environment(), N5_PUBLIC_ORIGIN: origin };
      const result = subprocess(['-e', `require('./packages/shared/dist/config.js').loadWorkerConfig('${role}',process.env)`], env);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('N5_PUBLIC_ORIGIN');
    });
  it(`SL-007 ${role} accepts configured six-character width and rejects ten`, () => {
    const env = { ...environment(), N5_PUBLIC_ORIGIN: 'https://clipmkr.ru', N5_SHORT_CODE_LENGTH: '6' };
    expect(loadWorkerConfig(role, env).publicOrigin).toBe(env.N5_PUBLIC_ORIGIN);
    expect(() => loadWorkerConfig(role, { ...env, N5_SHORT_CODE_LENGTH: '10' })).toThrow('N5_PUBLIC_ORIGIN');
  });
}

it.each(['worker-stt', 'worker-llm'] as const)('%s subprocess refuses missing rerender limit', role => {
  const env = environment(); delete env.N5_LIMIT_USER_RERENDERS;
  const result = subprocess(['-e', `require('./packages/shared/dist/config.js').loadWorkerConfig('${role}', process.env)`], env);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('N5_LIMIT_USER_RERENDERS');
  expect(result.stderr).toContain('смена музыки останется без потолка перерендеров');
});
