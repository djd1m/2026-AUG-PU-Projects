// RV-share-card-and-growth-events-06 — таблица «Criterion coverage» в
// `docs/features/share-card-and-growth-events/05_completion.md` обязана быть ФАКТИЧЕСКОЙ: каждый
// названный в ней файл теста СУЩЕСТВУЕТ, и каждый дословно процитированный заголовок ЕСТЬ в одном
// из файлов своей строки. Ревью нашло таблицу плановой (четыре несуществующих файла); её
// исправили руками — этот страж переносит свойство со слоя 4 (внимание автора) на слой 1
// (`.claude/rules/cost-of-detection-ladder.md`), чтобы следующая правка не вернула плановые пути.
//
// Испытан мутацией ТЕКСТА РЕАЛЬНОГО документа в памяти (`guard-must-be-able-to-fail.md`):
// возвращённый плановый путь и искажённый заголовок обязаны покрасить страж.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const COMPLETION_FILE = path.join(ROOT, 'docs/features/share-card-and-growth-events/05_completion.md');
// Заголовок раздела с начала строки: в «Статусе документа» то же имя упомянуто в тексте.
const SECTION_START = '\n## Criterion coverage\n';

interface Row {
  readonly criterion: string;
  readonly files: string[];
  readonly titles: string[];
}

/**
 * Заголовки ячейки: верхнеуровневые `…` и «…». Разбор последовательный, а не двумя регэкспами:
 * «ёлочки» встречаются ВНУТРИ заголовка в обратных кавычках (AC-13, «Ш»), а обратные кавычки —
 * внутри заголовка в «ёлочках» (AC-14, `name: type;`). Незакрытая кавычка — отказ разбора.
 */
function extractQuotedTitles(cell: string): string[] {
  const titles: string[] = [];
  let i = 0;
  while (i < cell.length) {
    const ch = cell[i]!;
    const close = ch === '`' ? '`' : ch === '«' ? '»' : undefined;
    if (close === undefined) {
      i += 1;
      continue;
    }
    const end = cell.indexOf(close, i + 1);
    if (end === -1) throw new Error(`незакрытая кавычка ${ch} в ячейке: ${cell}`);
    titles.push(cell.slice(i + 1, end));
    i = end + 1;
  }
  return titles;
}

/** Строки таблицы раздела «Criterion coverage»; пустой результат — отказ, а не «нарушений нет». */
function parseCoverageRows(doc: string): Row[] {
  const start = doc.indexOf(SECTION_START);
  if (start === -1) throw new Error(`раздел «## Criterion coverage» не найден — проверка НЕ выполнена`);
  const after = doc.slice(start + SECTION_START.length);
  const nextSection = after.search(/\n## /);
  const section = nextSection === -1 ? after : after.slice(0, nextSection);

  const rows: Row[] = [];
  let lastCriterion = '';
  for (const line of section.split('\n')) {
    if (!line.startsWith('|') || /^\|\s*-/.test(line) || line.startsWith('| Criterion')) continue;
    const cells = line.split(' | ').map((c) => c.replace(/^\|\s*/, '').replace(/\s*\|$/, ''));
    if (cells.length < 4) throw new Error(`строка таблицы не разобрана: ${line}`);
    const criterion = cells[0]!.trim() || lastCriterion;
    lastCriterion = criterion;
    const filesCell = cells[2]!;
    const titlesCell = cells.slice(3).join(' | ');
    const files = [...filesCell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    rows.push({ criterion, files, titles: extractQuotedTitles(titlesCell) });
  }
  if (rows.length === 0) throw new Error('таблица покрытия пуста — проверка НЕ выполнена');
  return rows;
}

/** Нарушения: несуществующий файл, строка без файла/заголовка, заголовок не найден дословно. */
function coverageViolations(doc: string): string[] {
  const violations: string[] = [];
  for (const row of parseCoverageRows(doc)) {
    if (row.files.length === 0) violations.push(`${row.criterion}: не назван ни один файл`);
    if (row.titles.length === 0) violations.push(`${row.criterion}: не процитирован ни один заголовок`);
    const sources: string[] = [];
    for (const file of row.files) {
      const abs = path.join(ROOT, file);
      if (!existsSync(abs)) violations.push(`${row.criterion}: файла нет — ${file}`);
      else sources.push(readFileSync(abs, 'utf8'));
    }
    for (const title of row.titles) {
      if (!sources.some((src) => src.includes(title))) violations.push(`${row.criterion}: заголовок не найден дословно — ${title}`);
    }
  }
  return violations;
}

describe('RV-06: таблица покрытия 05_completion.md фактическая', () => {
  it('каждый названный файл существует, каждый процитированный заголовок есть в файлах своей строки', () => {
    const doc = readFileSync(COMPLETION_FILE, 'utf8');
    const rows = parseCoverageRows(doc);
    expect(rows.map((r) => r.criterion)).toEqual(expect.arrayContaining(Array.from({ length: 18 }, (_, i) => `AC-${i + 1}`)));
    expect(coverageViolations(doc)).toEqual([]);
  });

  it('ИСПЫТАНИЕ 1: возвращённый в строку плановый путь (tests/guard/share-card-field-set.test.ts) красит страж', () => {
    const doc = readFileSync(COMPLETION_FILE, 'utf8');
    const real = '| `tests/unit/share-card-field-set-guard.test.ts` |';
    expect(doc.includes(real)).toBe(true);
    const mutated = doc.replace(real, '| `tests/guard/share-card-field-set.test.ts` |');
    expect(coverageViolations(mutated)).toContain('AC-14: файла нет — tests/guard/share-card-field-set.test.ts');
  });

  it('ИСПЫТАНИЕ 2: заголовок, которого нет в файле (плановая формулировка), красит страж', () => {
    const doc = readFileSync(COMPLETION_FILE, 'utf8');
    const real = '`AC-16: share_card_recognition_id_unique существует';
    expect(doc.includes(real)).toBe(true);
    const mutated = doc.replace(real, '`AC-16: уникальность share_card по recognition_id существует');
    expect(coverageViolations(mutated).some((v) => v.startsWith('AC-16: заголовок не найден дословно'))).toBe(true);
  });

  it('ИСПЫТАНИЕ 3: пропавший раздел — отказ (исключение), а не «нарушений нет»', () => {
    const doc = readFileSync(COMPLETION_FILE, 'utf8');
    expect(() => coverageViolations(doc.replace(SECTION_START, '\n## Покрытие\n'))).toThrow(/НЕ выполнена/);
  });
});
