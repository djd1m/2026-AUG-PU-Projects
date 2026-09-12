import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Интеграционный и конкурентный слои. Запускаются ТОЛЬКО там, где есть настоящий
// PostgreSQL профиля `test`:
//   docker compose --profile test run --rm test npm run test:integration
// fileParallelism отключён намеренно: файлы делят одну базу, и параллельные файлы
// мешали бы друг другу счётчиками. ВНУТРИ файла конкуренция обязательна — она и есть
// предмет проверки разделяемого ресурса.
export default defineConfig({
  resolve: {
    alias: {
      '@n4/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
      '@n4/db': fileURLToPath(new URL('./packages/db/src/index.ts', import.meta.url)),
    },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    include: [
      'tests/integration/**/*.test.ts',
      'tests/integration/**/*.test.tsx',
      'tests/concurrency/**/*.test.ts',
    ],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
