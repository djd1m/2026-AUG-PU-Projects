// из N5: projects/05-podcast-clips-opus/vitest.config.ts — алиасы @n6/*, без браузерного набора
import { configDefaults, defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: {
    '@n6/rag': path.resolve('packages/rag/src/index.ts'),
    '@n6/db': path.resolve('packages/db/src/index.ts'),
    '@n6/queue': path.resolve('packages/queue/src/index.ts'),
  } },
  test: { exclude: [...configDefaults.exclude], reporters: ['default', './scripts/test-skip-reporter.ts'], include: ['tests/**/*.test.ts'],
    testTimeout: 20000, hookTimeout: 20000, pool: 'forks', maxWorkers: 2, fileParallelism: false },
});
