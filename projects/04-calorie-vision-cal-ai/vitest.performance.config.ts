import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Слой производительности (NFR-source-and-correct-1): вставка 300 000 строк + 200
// поисков идёт МИНУТЫ, а не секунды обычного integration-прогона. Отдельная команда,
// чтобы не удлинять каждый `npm test`/`npm run test:integration`
// (`03_architecture.md`, «Структура каталогов»). Тот же профиль `test` docker compose.
export default defineConfig({
  resolve: {
    alias: {
      '@n4/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
      '@n4/db': fileURLToPath(new URL('./packages/db/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/performance/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
});
