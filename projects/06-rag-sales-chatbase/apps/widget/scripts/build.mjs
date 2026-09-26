#!/usr/bin/env node
// из N1: projects/01-testimonials-senja/apps/widget/scripts/build.mjs — адаптировано: потолок 45 КБ gzip (канон §7),
// выход — apps/web/widget-bundle/ (НЕ public/: бандл раздаёт маршрут web `GET /w/[file]`, который отвечает и на
// старые хэши — теги, уже вставленные на сайты клиентов, не ломаются после выпуска; A-N6-034), манифест
// { file } — контракт с кабинетом (apps/web/src/server/widget-bundle.ts). Превышение потолка валит сборку кодом 1.
import esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUDGET_BYTES, checkBundleSize } from './check-bundle-size.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = path.resolve(ROOT, '../web/widget-bundle');

const result = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/index.ts')], bundle: true, write: false, format: 'iife', platform: 'browser',
  target: ['es2020', 'safari16.4'], minify: true, legalComments: 'none', charset: 'utf8',
});
const code = result.outputFiles[0].contents;
const hash = createHash('sha256').update(code).digest('hex').slice(0, 16);
const file = `widget.${hash}.js`;
mkdirSync(OUT_DIR, { recursive: true });
for (const old of readdirSync(OUT_DIR)) if (/^widget\.[0-9a-f]+\.js$/.test(old) || old === 'manifest.json') rmSync(path.join(OUT_DIR, old));
writeFileSync(path.join(OUT_DIR, file), code);
const size = checkBundleSize(path.join(OUT_DIR, file));
const kb = (n) => (n / 1024).toFixed(2);
console.log(`[widget] ${file}: raw=${kb(size.rawBytes)} КБ, gzip=${kb(size.gzipBytes)} КБ, потолок ${kb(BUDGET_BYTES)} КБ`);
if (!size.ok) {
  rmSync(path.join(OUT_DIR, file));
  console.error('[widget] ПРЕВЫШЕН ПОТОЛОК БАНДЛА — сборка провалена, манифест не записан');
  process.exit(1);
}
writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify({ file, gzipBytes: size.gzipBytes, budgetBytes: BUDGET_BYTES }) + '\n');
