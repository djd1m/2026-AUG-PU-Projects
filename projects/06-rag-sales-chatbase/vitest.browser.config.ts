// из N5: projects/05-podcast-clips-opus/vitest.browser.config.ts (коммит 90fe80a) — без псевдонимов @clipmaker/*.
// jsx: браузерный набор рендерит НАСТОЯЩУЮ разметку страниц (Landing, Pricing, AuthForm, CabinetEmpty), а не её копию.
// widget-runtime-and-badge: + псевдонимы @n6/* (оснастка чужого origin зовёт НАСТОЯЩИЕ обработчики /w/v1/*) и axe.
import { defineConfig } from 'vitest/config';
import path from 'node:path';
// playwright — из отдельного пакета прибора scripts/responsive (ADR-007: не в корне монорепо).
export default defineConfig({ esbuild: { jsx: 'automatic' },
  resolve: { alias: [
    { find: /^playwright$/, replacement: path.resolve('scripts/responsive/node_modules/playwright/index.mjs') },
    { find: /^@axe-core\/playwright$/, replacement: path.resolve('scripts/responsive/node_modules/@axe-core/playwright/dist/index.mjs') },
    { find: /^@n6\/rag\/(check-address|bot-settings)$/, replacement: path.resolve('packages/rag/src') + '/$1.ts' },
    { find: /^@n6\/rag$/, replacement: path.resolve('packages/rag/src/index.ts') },
    { find: /^@n6\/db$/, replacement: path.resolve('packages/db/src/index.ts') },
  ] },
  test: { include: ['tests/browser/**/*.test.ts'],
    testTimeout: 30000, hookTimeout: 30000, fileParallelism: false, maxWorkers: 1 } });
