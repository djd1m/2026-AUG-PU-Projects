import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: {
    '@clipmaker/shared/config': path.resolve('packages/shared/src/config.ts'),
    '@clipmaker/shared/enums': path.resolve('packages/shared/src/enums.ts'),
    '@clipmaker/db': path.resolve('packages/db/src/index.ts'),
  } },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 15000, hookTimeout: 15000,
    pool: 'forks', maxWorkers: 2, fileParallelism: false },
});
