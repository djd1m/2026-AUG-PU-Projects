// из N5: projects/05-podcast-clips-opus/vitest.config.ts — алиасы @n6/*; jsx и исключение браузерного набора (design-shell):
// tests/browser/** идёт только в контейнере Playwright (vitest.browser.config.ts, scripts/check-responsive.sh --test).
import { configDefaults, defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: {
    '@n6/rag': path.resolve('packages/rag/src/index.ts'),
    '@n6/db': path.resolve('packages/db/src/index.ts'),
    '@n6/queue': path.resolve('packages/queue/src/index.ts'),
  } },
  test: { exclude: [...configDefaults.exclude, 'tests/browser/**'], reporters: ['default', './scripts/test-skip-reporter.ts'], include: ['tests/**/*.test.ts'],
    testTimeout: 20000, hookTimeout: 20000, pool: 'forks', maxWorkers: 2, fileParallelism: false },
});
