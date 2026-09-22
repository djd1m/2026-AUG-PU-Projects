import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: {
    '@clipmaker/shared/config': path.resolve('packages/shared/src/config.ts'),
    '@clipmaker/shared/enums': path.resolve('packages/shared/src/enums.ts'),
    '@clipmaker/shared/upload': path.resolve('packages/shared/src/upload.ts'),
    '@clipmaker/shared/transcript': path.resolve('packages/shared/src/transcript.ts'),
    '@clipmaker/shared/fragments': path.resolve('packages/shared/src/fragments.ts'),
    '@clipmaker/s3': path.resolve('packages/s3/src/index.ts'),
    '@clipmaker/queue': path.resolve('packages/queue/src/index.ts'),
    '@clipmaker/db': path.resolve('packages/db/src/index.ts'),
  } },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 15000, hookTimeout: 15000,
    pool: 'forks', maxWorkers: 2, fileParallelism: false },
});
