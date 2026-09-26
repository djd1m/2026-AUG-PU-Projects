// из N5: projects/05-podcast-clips-opus/vitest.config.ts — алиасы @n6/*; jsx и исключение браузерного набора (design-shell):
// tests/browser/** идёт только в контейнере Playwright (vitest.browser.config.ts, scripts/check-responsive.sh --test).
import { configDefaults, defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  // Массив, а не объект: строковый псевдоним '@n6/rag' съел бы и подпуть '@n6/rag/check-address' (preview-flow).
  resolve: { alias: [
    { find: /^@n6\/rag\/(check-address|bot-settings)$/, replacement: path.resolve('packages/rag/src') + '/$1.ts' },
    { find: /^@n6\/rag$/, replacement: path.resolve('packages/rag/src/index.ts') },
    { find: /^@n6\/db$/, replacement: path.resolve('packages/db/src/index.ts') },
    { find: /^@n6\/queue$/, replacement: path.resolve('packages/queue/src/index.ts') },
  ] },
  test: { exclude: [...configDefaults.exclude, 'tests/browser/**'], reporters: ['default', './scripts/test-skip-reporter.ts'], include: ['tests/**/*.test.ts'],
    testTimeout: 20000, hookTimeout: 20000, pool: 'forks', maxWorkers: 2, fileParallelism: false },
});
