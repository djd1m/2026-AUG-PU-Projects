#!/usr/bin/env node
// scripts/check-bundle-size.mjs
//
// CI-гейт бюджета бандла (.claude/rules/coding-style.md §3, docs/Specification.md
// FR-NFR-PERF-001, docs/Refinement.md §4): виджет ≤ 30 KB gzip, провал сборки при превышении.
// Используется и напрямую (`npm run check:size` — на уже собранный dist/), и из build.mjs
// сразу после бандлинга (единая логика, не дублируется).

import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

export const BUDGET_BYTES = 30 * 1024; // 30 KB gzip — FR-NFR-PERF-001

/**
 * @param {string} filePath путь к собранному JS-файлу виджета
 * @returns {{ rawBytes: number, gzipBytes: number, ok: boolean }}
 */
export function checkBundleSize(filePath) {
  const raw = readFileSync(filePath);
  const gzip = gzipSync(raw, { level: 9 }); // coding-style.md §3: "gzip -9"
  const gzipBytes = gzip.byteLength;
  return { rawBytes: raw.byteLength, gzipBytes, ok: gzipBytes <= BUDGET_BYTES };
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Использование: node scripts/check-bundle-size.mjs <путь-к-widget.js>');
    process.exit(1);
  }
  const { rawBytes, gzipBytes, ok } = checkBundleSize(filePath);
  const kb = (n) => (n / 1024).toFixed(2);
  console.log(`[check-bundle-size] ${filePath}: raw=${kb(rawBytes)} KB, gzip=${kb(gzipBytes)} KB` +
    ` (бюджет ${kb(BUDGET_BYTES)} KB)`);
  if (!ok) {
    console.error(
      `[check-bundle-size] ПРЕВЫШЕН БЮДЖЕТ: ${kb(gzipBytes)} KB gzip > ${kb(BUDGET_BYTES)} KB ` +
        '(FR-NFR-PERF-001). Сборка провалена.',
    );
    process.exit(1);
  }
}

// Запускать как самостоятельный CLI только при прямом вызове, не при импорте из build.mjs.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
