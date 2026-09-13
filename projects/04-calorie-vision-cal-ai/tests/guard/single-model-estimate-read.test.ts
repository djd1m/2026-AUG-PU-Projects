// `GuardSingleModelEstimateRead` (`02_pseudocode.md`, FR-source-and-correct-13,
// AC-source-and-correct-24, ADR-001 Confirmation (3)).
//
// `model_estimate_kcal` (и camelCase-форма `modelEstimateKcal`) обязано читаться РОВНО в
// одном месте для АРИФМЕТИКИ — при вычислении `discrepancy_ratio`. Передача значения на
// хранение (`modelEstimateKcal: finalResponse.modelEstimateKcal,` — форвардинг из ответа
// модели в `ResultRecord`, ЕДИНСТВЕННЫЙ способ, которым число вообще попадает в
// `recognition.model_estimate_kcal`) — НЕ арифметическое чтение и не считается: страж
// проверяет ИСПОЛЬЗОВАНИЕ значения в вычислении, а не факт его существования в коде.
//
// Область — `apps/recognizer/src`, `apps/api/src` (буквальная формулировка FR-13) И
// `packages/shared/src` (РАСШИРЕНИЕ, задокументированное в квитанции Phase 3): реальная
// арифметика физически живёт в `packages/shared/src/domain/food-compute.ts`, потому что
// `evaluateDiscrepancy` — ОДНА функция для `recognizer` (первичное вычисление) и `api`
// (пересчёт после правки) — два места с одной арифметикой иначе разошлись бы молча
// (`security-operation-order.md`). Более широкая область строже минимально требуемой,
// не слабее.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCOPE = ['apps/recognizer/src', 'apps/api/src', 'packages/shared/src'];

async function sourceFiles(relative: string): Promise<string[]> {
  const base = path.join(ROOT, relative);
  const found: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) found.push(full);
    }
  };
  await walk(base);
  return found;
}

async function readScope(): Promise<Array<{ file: string; code: string }>> {
  const all: Array<{ file: string; code: string }> = [];
  for (const relative of SCOPE) {
    for (const file of await sourceFiles(relative)) {
      all.push({ file: path.relative(ROOT, file), code: await readFile(file, 'utf8') });
    }
  }
  return all;
}

function codeLines(source: string): string[] {
  return source.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));
}

const IDENTIFIER = /(modelEstimateKcal|model_estimate_kcal)/;

/**
 * Строка — АРИФМЕТИЧЕСКОЕ чтение, если идентификатор участвует в вычитании, делении или
 * стоит аргументом `Math.abs(`. Присваивание/передача значения (`modelEstimateKcal:
 * finalResponse.modelEstimateKcal,` или объявление поля типа) этому не соответствует —
 * там нет ни одного арифметического оператора рядом с идентификатором.
 */
function isArithmeticRead(line: string): boolean {
  if (!IDENTIFIER.test(line)) return false;
  if (/^\s*(import|export\s+(type\s+)?\{|readonly\s+\w+[?]?:|interface\s|type\s+\w+\s*=)/.test(line)) return false;
  return (
    /Math\.abs\(\s*(modelEstimateKcal|model_estimate_kcal)/.test(line) ||
    /(modelEstimateKcal|model_estimate_kcal)\s*[-]/.test(line) ||
    /[-]\s*(modelEstimateKcal|model_estimate_kcal)/.test(line)
  );
}

function findArithmeticReads(files: Array<{ file: string; code: string }>): string[] {
  const offenders: string[] = [];
  for (const { file, code } of files) {
    for (const line of codeLines(code)) {
      if (isArithmeticRead(line)) offenders.push(`${file}: ${line.trim()}`);
    }
  }
  return offenders;
}

describe('GuardSingleModelEstimateRead (AC-source-and-correct-24)', () => {
  it('на РЕАЛЬНОМ коде — РОВНО одно арифметическое чтение, и оно в food-compute.ts (evaluateDiscrepancy)', async () => {
    const files = await readScope();
    const reads = findArithmeticReads(files);
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatch(/food-compute\.ts/);
  });

  it('ветки вычисления kcal/protein/fat/carb используют source_snapshot, а не поле ответа модели', async () => {
    const files = await readScope();
    const computeFile = files.find(({ file }) => file.endsWith('domain/food-compute.ts'));
    expect(computeFile).toBeDefined();
    // `computeItemFromSnapshot` не ссылается ни на `ModelResponse`, ни на `RecognizedItemDraft`
    // — единственный источник чисел позиции это параметр `sourceSnapshot`/`parts[].sourceSnapshot`.
    expect(computeFile?.code).not.toMatch(/ModelResponse|RecognizedItemDraft/);
    expect(computeFile?.code).toMatch(/sourceSnapshot/);
  });

  it('ИСПЫТАНИЕ СТРАЖА (guard-must-be-able-to-fail.md): внедрённое ВТОРОЕ арифметическое чтение красит тест', async () => {
    const files = await readScope();
    const withoutMutation = findArithmeticReads(files);
    expect(withoutMutation).toHaveLength(1); // зелёный — ДО мутации

    // Мутация — В ПАМЯТИ: второе арифметическое чтение в файле, который его не должен
    // содержать (симулирует регресс, где кто-то повторно считает расхождение в apps/api).
    const mutatedFiles = files.map((entry) =>
      entry.file.endsWith('correct/apply-op.ts')
        ? { ...entry, code: `${entry.code}\nconst debugRatio = Math.abs(modelEstimateKcal - 1);\n` }
        : entry,
    );
    expect(mutatedFiles).not.toEqual(files); // подтверждает, что мутация реально применена
    const withMutation = findArithmeticReads(mutatedFiles);
    expect(withMutation.length).toBe(2); // КРАСНЫЙ: два чтения вместо одного

    // Восстановление (тот же файл без мутации) — снова ЗЕЛЁНЫЙ.
    expect(findArithmeticReads(files)).toHaveLength(1);
  });
});
