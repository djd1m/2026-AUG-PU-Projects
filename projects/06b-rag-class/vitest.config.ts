import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export const alias = [
  { find: /^@n6b\/db$/, replacement: fileURLToPath(new URL('./packages/db/src/index.ts', import.meta.url)) },
  { find: /^@\//, replacement: fileURLToPath(new URL('./apps/web/src/', import.meta.url)) },
];

// Unit: без БД и без сети. Интеграция — vitest.int.config.ts.
export default defineConfig({
  resolve: { alias },
  test: {
    environment: 'node',
    include: ['{apps,packages,services}/*/tests/unit/**/*.test.ts'],
    testTimeout: 30000,
  },
});
