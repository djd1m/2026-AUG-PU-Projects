#!/usr/bin/env node
// Раскладка собранного виджета в apps/web/public (ADR-007).
//
// До этого шага apps/widget/dist существовал сам по себе: Dockerfile звал `build:widget`,
// но бандл никуда не попадал, и сниппет из FR-001 вёл на несуществующий файл.
//
// Имя версионировано content-hash'ем — поэтому копируется КАК ЕСТЬ, вместе с manifest.json:
// он единственный источник знания о том, как файл сейчас называется. Старые версии из public
// вычищаются, иначе каталог растёт с каждой сборкой.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'apps/widget/dist');
const PUBLIC = path.join(ROOT, 'apps/web/public');

const manifestPath = path.join(DIST, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error('нет apps/widget/dist/manifest.json — сначала `npm run build --workspace apps/widget`');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!manifest.file) {
  console.error('manifest.json без поля file — сборка виджета неполна');
  process.exit(1);
}

mkdirSync(PUBLIC, { recursive: true });

// Убрать бандлы прошлых сборок: имена разные (content-hash), иначе public копится.
for (const entry of readdirSync(PUBLIC)) {
  if (/^widget\.[0-9a-f]+\.js$/.test(entry) && entry !== manifest.file) {
    rmSync(path.join(PUBLIC, entry));
  }
}

copyFileSync(path.join(DIST, manifest.file), path.join(PUBLIC, manifest.file));
copyFileSync(manifestPath, path.join(PUBLIC, 'widget-manifest.json'));

console.log(`виджет разложен: public/${manifest.file} (${manifest.gzipBytes ?? '?'} B gzip)`);
