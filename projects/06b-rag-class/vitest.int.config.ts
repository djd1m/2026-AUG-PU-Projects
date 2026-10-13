import { defineConfig } from 'vitest/config';
import { alias } from './vitest.config';

// Интеграция: реальный Postgres + pgvector (тестовый контейнер во внутренней сети docker, без публикации портов).
// Файлы последовательно: общая схема и общий счётчик квот.
export default defineConfig({
  resolve: { alias },
  test: {
    environment: 'node',
    include: ['{apps,packages,services}/*/tests/int/**/*.test.ts'],
    globalSetup: ['./packages/db/tests/int/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
