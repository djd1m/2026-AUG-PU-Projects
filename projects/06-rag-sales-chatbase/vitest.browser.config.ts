// из N5: projects/05-podcast-clips-opus/vitest.browser.config.ts (коммит 90fe80a) — без псевдонимов @clipmaker/*.
// jsx: браузерный набор рендерит НАСТОЯЩУЮ разметку страниц (Landing, Pricing, AuthForm, CabinetEmpty), а не её копию.
import { defineConfig } from 'vitest/config';
import path from 'node:path';
// playwright — из отдельного пакета прибора scripts/responsive (ADR-007: не в корне монорепо).
export default defineConfig({ esbuild: { jsx: 'automatic' },
  resolve: { alias: [{ find: /^playwright$/, replacement: path.resolve('scripts/responsive/node_modules/playwright/index.mjs') }] },
  test: { include: ['tests/browser/**/*.test.ts'],
    testTimeout: 30000, hookTimeout: 30000, fileParallelism: false, maxWorkers: 1 } });
