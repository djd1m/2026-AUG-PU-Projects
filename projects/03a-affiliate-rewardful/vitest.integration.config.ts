import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/**/*.integration.test.ts', 'packages/**/*.integration.test.ts', 'tests/workspace.test.ts'],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
