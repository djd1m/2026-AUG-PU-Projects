import { defineConfig } from 'vitest/config';

// packages/db/vitest.config.ts
// Интеграционные тесты бьют в реальную Postgres (см. tests/setup.ts) — файлы гоняются
// последовательно (fileParallelism: false), чтобы не гонять truncateAll() параллельно с другим
// файлом, который читает те же таблицы.
export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
