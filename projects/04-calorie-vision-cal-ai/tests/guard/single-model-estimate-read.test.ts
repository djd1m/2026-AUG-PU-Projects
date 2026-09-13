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

/** Нормализует имя для сравнения camelCase/snake_case: "modelEstimateKcal" ≡ "model_estimate_kcal". */
function normalizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
const IDENTIFIER_NORMALIZED = normalizeName('modelEstimateKcal');
function namesMatch(name: string): boolean {
  return normalizeName(name) === IDENTIFIER_NORMALIZED;
}

/**
 * Убирает содержимое строковых литералов (`'…'`, `"…"`, `` `…` ``), заменяя его пробелами
 * той же длины. Упоминание идентификатора ВНУТРИ чужого текста (промпт модели, список
 * имён полей схемы для валидации) — не чтение значения, а текст; без вырезания строк
 * такое упоминание ложно засчиталось бы как использование переменной.
 */
function stripStringLiterals(line: string): string {
  let result = '';
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote !== null) {
      result += ch === quote ? ch : ' ';
      if (ch === quote && line[i - 1] !== '\\') quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      result += ch;
    } else {
      result += ch;
    }
  }
  return result;
}

/** Разбивает строку по запятым ВЕРХНЕГО уровня, не заходя внутрь `(){}[]`. */
function splitTopLevel(line: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of line) {
    if ('([{'.includes(ch)) depth += 1;
    if (')]}'.includes(ch)) depth -= 1;
    if (ch === ',' && depth <= 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * РАЗРЕШЁННОЕ использование — «самоимённая пересылка»: `modelEstimateKcal: x.modelEstimateKcal`
 * (объект) или `modelEstimateKcal = x.modelEstimateKcal` (присваивание) — имя слева от
 * `:`/`=` совпадает (с точностью до camelCase/snake_case) с самим идентификатором. Это
 * единственный узаконенный способ, которым значение вообще попадает в
 * `recognition.model_estimate_kcal` (форвардинг из ответа модели) и обратно в ответ API —
 * оно продолжает называться «оценкой модели», а не подменяет собой другое поле.
 *
 * ЗАПРЕЩЁННОЕ использование (RV-source-and-correct-02 слепого ревью, 2026-09-13) — то же
 * присваивание/свойство, но имя СЛЕВА другое: `const dbKcalTotal = finalResponse.modelEstimateKcal;`
 * переименовывает оценку модели в предполагаемый ИТОГ ИЗ БАЗЫ — ровно тот чёрный ход,
 * который страж обязан ловить. Так же — любой арифметический оператор рядом с
 * идентификатором (`+`,`-`,`*`,`/`, `Math.abs(`).
 */
function isDisallowedUse(rawLine: string): boolean {
  if (!IDENTIFIER.test(rawLine)) return false;
  if (/^\s*(import|export\s+(type\s+)?\{|readonly\s+\w+[?]?:|interface\s|type\s+\w+\s*=)/.test(rawLine)) return false;
  const line = stripStringLiterals(rawLine);
  if (!IDENTIFIER.test(line)) return false; // идентификатор был только внутри строкового литерала

  // Арифметика: любой из +,-,*,/ рядом с идентификатором, либо Math.abs(идентификатор.
  if (/Math\.abs\(\s*(modelEstimateKcal|model_estimate_kcal)/.test(line)) return true;
  if (/(modelEstimateKcal|model_estimate_kcal)\s*[-+*/]/.test(line)) return true;
  if (/[-+*/]\s*(modelEstimateKcal|model_estimate_kcal)/.test(line)) return true;

  // ЧИСТЫЙ путь до идентификатора: RHS/значение — ТОЛЬКО цепочка доступа к полю
  // (`finalResponse.modelEstimateKcal`), без вызова функции и без второго аргумента.
  // Различает переименовывающее присваивание (`const dbKcalTotal = x.modelEstimateKcal;`
  // — ЗАПРЕЩЕНО) от легитимной передачи АРГУМЕНТОМ в единственную арифметическую функцию
  // (`const discrepancy = evaluateDiscrepancy(x.modelEstimateKcal, dbKcalTotal);` —
  // РАЗРЕШЕНО: результат вызова присваивается `discrepancy`, а не значение идентификатора).
  const isPureIdentifierPath = (value: string): boolean => /^[\w.]*\.?(modelEstimateKcal|model_estimate_kcal)\s*[;,]?\s*$/.test(value.trim());

  // Присваивание переменной: `<name> = <rhs>` (не ==, !=, <=, >=, =>).
  const assign = line.match(/^\s*(?:const|let|var)?\s*([A-Za-z_$][\w]*)\s*(?<![=!<>])=(?![=>])\s*(.+)$/);
  if (assign?.[1] !== undefined && assign[2] !== undefined) {
    if (isPureIdentifierPath(assign[2]) && !namesMatch(assign[1])) return true;
  }

  // Свойство объектного литерала: `<key>: <value>` — по КАЖДОМУ фрагменту верхнего уровня
  // (строка может нести НЕСКОЛЬКО пар `key: value,` через запятую, как в `ResultRecord`).
  for (const segment of splitTopLevel(line)) {
    const prop = segment.match(/^\s*['"]?([A-Za-z_$][\w]*)['"]?\s*:\s*(.+)$/);
    if (prop?.[1] === undefined || prop[2] === undefined) continue;
    if (isPureIdentifierPath(prop[2]) && !namesMatch(prop[1])) return true;
  }

  return false;
}

/** Арифметическое чтение — подмножество запрещённых, испытанное отдельно тестом ниже. */
function isArithmeticRead(line: string): boolean {
  if (!IDENTIFIER.test(line)) return false;
  if (/^\s*(import|export\s+(type\s+)?\{|readonly\s+\w+[?]?:|interface\s|type\s+\w+\s*=)/.test(line)) return false;
  const stripped = stripStringLiterals(line);
  return (
    /Math\.abs\(\s*(modelEstimateKcal|model_estimate_kcal)/.test(stripped) ||
    /(modelEstimateKcal|model_estimate_kcal)\s*[-+*/]/.test(stripped) ||
    /[-+*/]\s*(modelEstimateKcal|model_estimate_kcal)/.test(stripped)
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

/**
 * Общий детектор (RV-source-and-correct-02): арифметика (подмножество, см.
 * `findArithmeticReads`) ОБЪЕДИНЕНА с переименовывающим присваиванием/свойством —
 * `const dbKcalTotal = finalResponse.modelEstimateKcal;` подменяет оценку модели итогом
 * из базы ровно так же незаметно, как второе арифметическое выражение, и обязана считаться
 * той же самой запрещённой формой использования, а не отдельной, необнаруживаемой.
 */
function findDisallowedUses(files: Array<{ file: string; code: string }>): string[] {
  const offenders: string[] = [];
  for (const { file, code } of files) {
    for (const line of codeLines(code)) {
      if (isDisallowedUse(line)) offenders.push(`${file}: ${line.trim()}`);
    }
  }
  return offenders;
}

describe('GuardSingleModelEstimateRead (AC-source-and-correct-24)', () => {
  it('на РЕАЛЬНОМ коде — РОВНО одно ЗАПРЕЩЁННОЕ использование (арифметика ИЛИ переименовывающее присваивание), и оно в food-compute.ts (evaluateDiscrepancy)', async () => {
    const files = await readScope();
    const reads = findDisallowedUses(files);
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatch(/food-compute\.ts/);
  });

  it('легитимная пересылка (ResultRecord, ответ API, разбор ответа модели) НЕ считается использованием — самоимённая передача разрешена везде', async () => {
    const files = await readScope();
    // Проверка выполняется на РЕАЛЬНЫХ файлах: recognize-scan.ts, response.ts,
    // scans-correct.ts, apply-op.ts, provider/live.ts форвардят значение под ТЕМ ЖЕ
    // именем — findDisallowedUses по ним не должен ничего найти, кроме единственной
    // законной арифметики в food-compute.ts (уже проверено тестом выше).
    const reads = findDisallowedUses(files);
    const forwardingFiles = reads.filter((r) => !r.includes('food-compute.ts'));
    expect(forwardingFiles).toEqual([]);
  });

  it('ИСПЫТАНИЕ СТРАЖА (RV-source-and-correct-02): `const dbKcalTotal = finalResponse.modelEstimateKcal;` красит проверку', async () => {
    const files = await readScope();
    expect(findDisallowedUses(files)).toHaveLength(1); // зелёный — ДО мутации

    // Внедряет РОВНО ту форму, которую нашёл слепой ревьюер: присваивание оценки модели
    // переменной, названной как итог из базы.
    const mutatedFiles = files.map((entry) =>
      entry.file.endsWith('recognize/recognize-scan.ts')
        ? { ...entry, code: `${entry.code}\nconst dbKcalTotal = finalResponse.modelEstimateKcal;\n` }
        : entry,
    );
    expect(mutatedFiles).not.toEqual(files);
    expect(findDisallowedUses(mutatedFiles).length).toBe(2); // КРАСНЫЙ

    expect(findDisallowedUses(files)).toHaveLength(1); // восстановление — снова ЗЕЛЁНЫЙ
  });

  it('ИСПЫТАНИЕ СТРАЖА (RV-source-and-correct-02): `const kcal = modelEstimateKcal * 1;` красит проверку', async () => {
    const files = await readScope();
    expect(findDisallowedUses(files)).toHaveLength(1); // зелёный — ДО мутации

    // Вторая форма, найденная ревьюером: умножение — раньше ловились только `Math.abs(`
    // и вычитание, а `*`/`+`/`/` рядом с идентификатором проходили незамеченными.
    const mutatedFiles = files.map((entry) =>
      entry.file.endsWith('correct/apply-op.ts') ? { ...entry, code: `${entry.code}\nconst kcal = modelEstimateKcal * 1;\n` } : entry,
    );
    expect(mutatedFiles).not.toEqual(files);
    expect(findDisallowedUses(mutatedFiles).length).toBe(2); // КРАСНЫЙ

    expect(findDisallowedUses(files)).toHaveLength(1); // восстановление — снова ЗЕЛЁНЫЙ
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

  it('ИСПЫТАНИЕ СТРАЖА («источник числа»): внедрённая ссылка на ModelResponse красит проверку (guard-must-be-able-to-fail.md)', async () => {
    const files = await readScope();
    const computeFile = files.find(({ file }) => file.endsWith('domain/food-compute.ts'));
    expect(computeFile).toBeDefined();

    // Мутация — В ПАМЯТИ: симулирует регресс, где кто-то читает kcal/protein/fat/carb
    // из формы ответа модели вместо параметра sourceSnapshot.
    const mutatedCode = `${computeFile?.code}\nfunction debugFromModel(r: ModelResponse) { return r; }\n`;
    expect(mutatedCode).not.toBe(computeFile?.code);
    expect(mutatedCode).toMatch(/ModelResponse|RecognizedItemDraft/); // КРАСНЫЙ на мутированном коде

    // Восстановление (немутированный код) — снова ЗЕЛЁНЫЙ.
    expect(computeFile?.code).not.toMatch(/ModelResponse|RecognizedItemDraft/);
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
