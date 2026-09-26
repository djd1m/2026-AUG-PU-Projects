import { defineConfig } from 'vitest/config';
import path from 'node:path';
// jsx и псевдоним витрины: браузерный набор рендерит настоящую разметку лендинга (фича 28), а не её копию.
export default defineConfig({ esbuild: { jsx: 'automatic' },
  // Фича 29: экран записи (VideoDetail) тянет enums, cta и каталог музыки — те же псевдонимы, что в vitest.config.ts.
  resolve: { alias: { '@clipmaker/shared/showcase': path.resolve('packages/shared/src/showcase.ts'),
    '@clipmaker/shared/enums': path.resolve('packages/shared/src/enums.ts'),
    '@clipmaker/shared/cta': path.resolve('packages/shared/src/cta.ts'),
    '@clipmaker/shared/music-catalog': path.resolve('packages/shared/src/music-catalog.ts') } },
  test: { include: ['tests/browser/**/*.test.ts'],
  testTimeout: 30000, hookTimeout: 30000, fileParallelism: false, maxWorkers: 1 } });
