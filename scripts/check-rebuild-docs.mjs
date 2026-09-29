#!/usr/bin/env node
// Страж «проект собирается с нуля по документам» — слой 1 (детерминированная часть).
// Проверяет ДЕКЛАРАЦИЮ, а не то, что сборка по ней действительно проходит: это суждение (Codex-ревью, слой 3).
//
//   node scripts/check-rebuild-docs.mjs projects/<проект>
//
// Коды: 0 — проверено, дефектов нет · 1 — дефект доказан и назван · 2 — проверка НЕ ВЫПОЛНЕНА (нет каталога проекта
// или docs/). Код 2 никогда не значит «всё в порядке».
//
// Что проверяется:
//  R1  docs/REPRODUCE.md существует и содержателен (≥ 40 непустых строк, есть разделы про тесты и развёртывание).
//  R2  docs/features/README.md перечисляет КАЖДЫЙ каталог docs/features/<имя>/ (по имени каталога).
//  R3  относительные ссылки [..](путь) в REPRODUCE.md и features/README.md ведут на существующие файлы.
//  R4  пути в `обратных кавычках` в REPRODUCE.md, начинающиеся с корней исходников (apps/, packages/, services/, scripts/,
//      infra/, variants/, shared/, src/, docs/, migrations/, tests/), существуют от корня проекта или репозитория.
//  R5  каждый идентификатор требования FR-… из docs/Specification.md упомянут в docs/test-scenarios.md (если он есть).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const arg = process.argv[2];
const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
if (!arg) { console.error('❌ укажите каталог проекта — проверка НЕ выполнена'); process.exit(2); }
const proj = resolve(arg);
const docs = join(proj, 'docs');
if (!existsSync(proj) || !existsSync(docs) || !statSync(docs).isDirectory()) {
  console.error(`❌ нет каталога ${arg}/docs — проверка НЕ выполнена`); process.exit(2);
}

const defects = [];
const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const rel = p => p.replace(repoRoot + '/', '');

// R1
const reproPath = join(docs, 'REPRODUCE.md');
const repro = read(reproPath);
if (repro === null) defects.push('R1 нет docs/REPRODUCE.md');
else {
  const lines = repro.split('\n').filter(l => l.trim()).length;
  if (lines < 40) defects.push(`R1 REPRODUCE.md слишком короткий: ${lines} непустых строк (< 40)`);
  if (!/тест/i.test(repro)) defects.push('R1 в REPRODUCE.md нет раздела о тестах');
  if (!/(развёрт|разверт|деплой|стенд|compose)/i.test(repro)) defects.push('R1 в REPRODUCE.md нет раздела о развёртывании/стенде');
}

// R2
const featDir = join(docs, 'features');
const featIndexPath = join(featDir, 'README.md');
const featIndex = read(featIndexPath);
const featDirs = existsSync(featDir)
  ? readdirSync(featDir).filter(n => statSync(join(featDir, n)).isDirectory()) : [];
if (featDirs.length && featIndex === null) defects.push(`R2 нет docs/features/README.md при ${featDirs.length} каталогах фич`);
if (featIndex !== null) for (const d of featDirs) if (!featIndex.includes(d)) defects.push(`R2 фича не в индексе: docs/features/${d}/`);

// R3
for (const [p, text] of [[reproPath, repro], [featIndexPath, featIndex]]) {
  if (text === null) continue;
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1].split('#')[0];
    if (!target || /^(https?:|mailto:|tel:)/.test(target)) continue;
    if (!existsSync(resolve(dirname(p), decodeURIComponent(target)))) defects.push(`R3 битая ссылка в ${rel(p)}: ${m[1]}`);
  }
}

// R4
if (repro !== null) {
  const roots = /^(apps|packages|services|scripts|infra|variants|shared|src|docs|migrations|tests)\//;
  const seen = new Set();
  for (const m of repro.matchAll(/`([^`\s]+)`/g)) {
    const p = m[1].replace(/[,.;:)]+$/, '');
    if (!roots.test(p) || /[<>*${}]/.test(p) || seen.has(p)) continue;
    seen.add(p);
    const clean = p.replace(/:\d+(-\d+)?$/, '');
    if (!existsSync(join(proj, clean)) && !existsSync(join(repoRoot, clean))) defects.push(`R4 путь из REPRODUCE.md не существует: ${p}`);
  }
}

// R5
const spec = read(join(docs, 'Specification.md'));
const scen = read(join(docs, 'test-scenarios.md'));
if (spec !== null && scen !== null) {
  const ids = [...new Set([...spec.matchAll(/\bFR-[A-Z0-9]+(?:-[A-Z0-9]+)*-?\d{1,4}\b/g)].map(m => m[0]))];
  for (const id of ids) if (!scen.includes(id)) defects.push(`R5 требование без сценария: ${id} (есть в Specification.md, нет в test-scenarios.md)`);
}

const name = rel(proj);
if (defects.length) {
  console.log(`❌ ${name}: дефектов ${defects.length}`);
  for (const d of defects) console.log('  - ' + d);
  process.exit(1);
}
console.log(`✅ ${name}: R1–R5 пройдены (фич в индексе: ${featDirs.length})`);
process.exit(0);
