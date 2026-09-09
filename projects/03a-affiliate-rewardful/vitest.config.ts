import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', 'tests/workspace.test.ts', '**/node_modules/**'],
    maxWorkers: 1,
    testTimeout: 15000,
  },
});
