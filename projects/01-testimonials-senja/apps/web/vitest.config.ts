import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@course/agent-payments/provider-yookassa': fileURLToPath(new URL('../../packages/agent-payments/src/provider-yookassa.ts', import.meta.url)),
      '@course/agent-payments': fileURLToPath(new URL('../../packages/agent-payments/src/index.ts', import.meta.url)),
      '@proofwall/db': fileURLToPath(new URL('../../packages/db/src/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
