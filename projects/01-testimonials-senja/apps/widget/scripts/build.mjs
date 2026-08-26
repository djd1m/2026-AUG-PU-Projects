#!/usr/bin/env node
// scripts/build.mjs
//
// Сборка виджета в один файл (esbuild, без React/фреймворк-рантайма — .claude/rules/
// coding-style.md §1/§3). Имя выходного файла версионируется по content-hash
// (docs/Architecture.md §8, ADR-007: "файл версионируется по content-hash в имени при билде") —
// это даёт агрессивный `Cache-Control: immutable` на статике без риска раздать устаревшую
// версию после деплоя. В конце — проверка бюджета 30 KB gzip (FR-NFR-PERF-001); превышение
// валит сборку ненулевым кодом выхода (coding-style.md §3: "провал сборки при превышении").

import esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkBundleSize } from './check-bundle-size.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');
const TMP_NAME = 'widget.tmp.js';

async function build() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const tmpPath = path.join(OUT_DIR, TMP_NAME);

  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'index.ts')],
    bundle: true,
    outfile: tmpPath,
    format: 'iife', // грузится как обычный <script>, не ES-модуль — совместимость шире
    platform: 'browser',
    target: ['es2019'],
    minify: true,
    legalComments: 'none',
    // Виджет не должен тянуть ничего из apps/web или packages/ui (React) — coding-style.md §1.
    // Отсутствие внешних зависимостей в package.json уже гарантирует это на уровне npm; здесь —
    // дополнительная страховка на уровне бандлера.
    external: [],
  });

  const raw = readFileSync(tmpPath);
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 8);
  const finalName = `widget.${hash}.js`;
  const finalPath = path.join(OUT_DIR, finalName);
  renameSync(tmpPath, finalPath);

  const { rawBytes, gzipBytes, ok } = checkBundleSize(finalPath);
  const kb = (n) => (n / 1024).toFixed(2);

  const manifest = {
    file: finalName,
    hash,
    rawBytes,
    gzipBytes,
    budgetBytes: 30 * 1024,
    builtAt: new Date().toISOString(),
  };
  writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`[build] ${finalName}: raw=${kb(rawBytes)} KB, gzip=${kb(gzipBytes)} KB`);

  if (!ok) {
    console.error(
      `[build] ПРЕВЫШЕН БЮДЖЕТ БАНДЛА: ${kb(gzipBytes)} KB gzip > 30.00 KB (FR-NFR-PERF-001).`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('[build] OK — в пределах бюджета 30 KB gzip.');
}

build().catch((err) => {
  console.error('[build] Сборка провалена:', err);
  process.exitCode = 1;
});
