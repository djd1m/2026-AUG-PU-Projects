import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit-слой: БАЗЫ НЕТ ВОВСЕ. Всё, чему нужен настоящий PostgreSQL, живёт в
// vitest.integration.config.ts и запускается в профиле `test` docker compose.
// Разделение не косметическое: конкурентные прогоны квоты и аренды на моке
// зеленеют при обеих реализациях и потому доказательством не являются.
export default defineConfig({
  resolve: {
    alias: {
      '@n4/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
      '@n4/db': fileURLToPath(new URL('./packages/db/src/index.ts', import.meta.url)),
    },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 15_000,
  },
});
