#!/usr/bin/env node
// из N1: projects/01-testimonials-senja/apps/widget/scripts/check-bundle-size.mjs — адаптировано: потолок 45 КБ gzip
// (канон §7, NFR-PERF-003), три кода возврата вместо двух: нечитаемый файл — «проверка НЕ ВЫПОЛНЕНА» (2), а не
// «в пределах» (guard-must-be-able-to-fail).
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const BUDGET_BYTES = 45 * 1024;

export function checkBundleSize(filePath, budget = BUDGET_BYTES) {
  const raw = readFileSync(filePath);
  const gzipBytes = gzipSync(raw, { level: 9 }).byteLength;
  return { rawBytes: raw.byteLength, gzipBytes, budgetBytes: budget, ok: gzipBytes <= budget };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2];
  if (!file) { console.error('Использование: node check-bundle-size.mjs <widget.<hash>.js>'); process.exit(2); }
  let result;
  try { result = checkBundleSize(file); } catch (error) { console.error(`НЕ ВЫПОЛНЕНО: файл не читается (${error.code ?? error})`); process.exit(2); }
  const kb = (n) => (n / 1024).toFixed(2);
  console.log(`[check-bundle-size] ${file}: raw=${kb(result.rawBytes)} КБ, gzip=${kb(result.gzipBytes)} КБ (потолок ${kb(BUDGET_BYTES)} КБ)`);
  if (!result.ok) { console.error('[check-bundle-size] ПРЕВЫШЕН ПОТОЛОК БАНДЛА — сборка провалена (канон §7: ≤ 45 КБ gzip)'); process.exit(1); }
}
