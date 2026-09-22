import { beforeAll, expect, it } from 'vitest';
import { subprocess } from './fixtures/subprocess';
import { readFileSync } from 'node:fs';
import { LIMIT_NAMES } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';

beforeAll(() => {
  expect(subprocess(['node_modules/typescript/bin/tsc', '-p', 'packages/shared/tsconfig.json']).status).toBe(0);
  expect(subprocess(['node_modules/typescript/bin/tsc', '-p', 'apps/web/tsconfig.preflight.json']).status).toBe(0);
});
const preflight = 'apps/web/.next/preflight/preflight.js';
it('Собранный preflight разрешает корректное окружение без подключения к БД', () => {
  const result = subprocess([preflight], environment(), 5000);
  expect(result.status, result.output).toBe(0);
});
for (const name of ['N5_PUBLIC_ORIGIN', ...LIMIT_NAMES]) {
  it(`preflight: отдельный процесс без ${name} завершается до сервера`, () => {
    const env = environment(); delete env[name];
    const result = subprocess([preflight], env, 5000);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1); expect(result.output).toContain(name);
  });
}
it('Оба production entrypoint запускают preflight до Next', () => {
  const pkg = JSON.parse(readFileSync('apps/web/package.json', 'utf8'));
  expect(pkg.scripts.start).toBe('node .next/preflight/preflight.js && next start');
  const docker = readFileSync('Dockerfile', 'utf8').split(' AS web')[1]!.split(' AS worker')[0]!;
  expect(docker).toContain('node apps/web/.next/preflight/preflight.js && exec node node_modules/next/dist/bin/next start apps/web');
});
