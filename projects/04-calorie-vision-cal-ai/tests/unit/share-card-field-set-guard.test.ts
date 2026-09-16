// AC-share-card-and-growth-events-14 — GuardShareCardFieldSet: множество полей
// `ShareCardRenderInput` (`packages/shared/src/domain/share-card.ts`) РОВНО из восьми имён,
// проверенное РАВЕНСТВОМ множеств, а не подмножеством (иначе новое поле того же смысла,
// например `dailyTotalKcal`, прошло бы незамеченным — тот же урок, что ADR-001).
//
// ПРАВКА ПОСЛЕ РЕВЬЮ (RV-share-card-and-growth-events-03, review-report.md): прежний извлекатель
// искал ТОЛЬКО строки вида `readonly name:` — законное TypeScript-поле БЕЗ `readonly`
// (`dailyTotalKcal: number;`) проходило незамеченным, что и воспроизвёл судья на копии
// интерфейса. Теперь извлечение — через РЕАЛЬНЫЙ AST компилятора TypeScript
// (`ts.createSourceFile` + `ts.isPropertySignature`), который видит `PropertySignature`
// ОДИНАКОВО независимо от `readonly`/`?`/их отсутствия — модификаторы не участвуют в том, что
// делает узел свойством интерфейса.
//
// Испытан на ТРЁХ внедрённых дефектах (`04_refinement.md`, «Стражи по исходнику», и
// `.claude/rules/guard-must-be-able-to-fail.md`): страж, ни разу не показавший красное, стражем
// не является. Мутация применяется к ТЕКСТУ РЕАЛЬНОГО файла (читается с диска, правится в
// памяти), а не к отдельно напечатанной копии интерфейса — иначе тест доказывал бы, что стражу
// подсунули корректный текст, а не то, что он ловит дефект в СВОЁМ файле.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIELD_SET_FILE = path.join(ROOT, 'packages/shared/src/domain/share-card.ts');
const INTERFACE_NAME = 'ShareCardRenderInput';
const REFERENCE_FIELDS = ['dishName', 'items', 'kcal', 'proteinG', 'fatG', 'carbG', 'sourceLabel', 'badgeRendered', 'photoUrl'];

/**
 * Извлекает имена ВСЕХ свойств интерфейса `interfaceName` через AST компилятора TypeScript —
 * `ts.isPropertySignature` возвращает узел одинаково для `readonly name: T;`, `name: T;`,
 * `name?: T;` и `readonly name?: T;`: модификаторы не влияют на то, что узел ЕСТЬ свойство.
 * Любой ДРУГОЙ вид члена интерфейса (индексная сигнатура, метод, вызываемая сигнатура) —
 * НЕПОДДЕРЖАННАЯ конструкция для этого контракта, страж явно об этом сообщает, а не молчит.
 */
function extractInterfaceFields(code: string): string[] {
  const sourceFile = ts.createSourceFile('share-card.ts', code, ts.ScriptTarget.Latest, true);
  let found: ts.InterfaceDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === INTERFACE_NAME) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (found === undefined) throw new Error(`интерфейс ${INTERFACE_NAME} не найден в файле`);

  const fields: string[] = [];
  for (const member of found.members) {
    if (ts.isPropertySignature(member) && member.name !== undefined && ts.isIdentifier(member.name)) {
      fields.push(member.name.text);
      continue;
    }
    throw new Error(`неподдержанный член интерфейса ${INTERFACE_NAME}: ${member.getText(sourceFile)}`);
  }
  return fields;
}

function guard(fields: string[]): { pass: boolean; extra: string[]; missing: string[] } {
  const actual = new Set(fields);
  const reference = new Set(REFERENCE_FIELDS);
  const extra = [...actual].filter((f) => !reference.has(f));
  const missing = [...reference].filter((f) => !actual.has(f));
  return { pass: extra.length === 0 && missing.length === 0, extra, missing };
}

/** Вставляет строку ПЕРЕД закрывающей скобкой интерфейса `ShareCardRenderInput` в РЕАЛЬНОМ
 *  тексте файла — мутация правит текст настоящего исходника, а не отдельно напечатанную копию
 *  интерфейса (иначе тест доказывал бы, что стражу подсунули корректный текст). */
function injectFieldIntoRealInterface(realCode: string, fieldLine: string): string {
  const marker = `export interface ${INTERFACE_NAME} {`;
  const start = realCode.indexOf(marker);
  if (start === -1) throw new Error(`маркер начала интерфейса ${INTERFACE_NAME} не найден`);
  const closingBrace = realCode.indexOf('\n}', start);
  if (closingBrace === -1) throw new Error(`закрывающая скобка интерфейса ${INTERFACE_NAME} не найдена`);
  return `${realCode.slice(0, closingBrace)}\n  ${fieldLine}${realCode.slice(closingBrace)}`;
}

describe('GuardShareCardFieldSet', () => {
  it('на РЕАЛЬНОМ файле: множество полей РОВНО восемь разрешённых имён', async () => {
    const code = await readFile(FIELD_SET_FILE, 'utf8');
    const fields = extractInterfaceFields(code);
    expect(fields.sort()).toEqual([...REFERENCE_FIELDS].sort());
    expect(guard(fields).pass).toBe(true);
  });

  it('ALLOWED_SHARE_CARD_FIELDS (эталон рантайм-проверки) совпадает с тем же множеством', async () => {
    const { ALLOWED_SHARE_CARD_FIELDS } = await import('../../packages/shared/src/domain/share-card.js');
    expect([...ALLOWED_SHARE_CARD_FIELDS].sort()).toEqual([...REFERENCE_FIELDS].sort());
  });

  it('ИСПЫТАНИЕ 1: лишнее поле С readonly, внедрённое в РЕАЛЬНЫЙ файл, красит страж', async () => {
    const realCode = await readFile(FIELD_SET_FILE, 'utf8');
    const mutatedCode = injectFieldIntoRealInterface(realCode, 'readonly dailyTotalKcal: number;');
    const result = guard(extractInterfaceFields(mutatedCode));
    expect(result.pass).toBe(false);
    expect(result.extra).toEqual(['dailyTotalKcal']);
  });

  it('ИСПЫТАНИЕ 2 (RV-share-card-and-growth-events-03 — обход, который прежний страж пропускал): лишнее поле БЕЗ readonly, обычная форма `name: type;`, тоже красит страж', async () => {
    const realCode = await readFile(FIELD_SET_FILE, 'utf8');
    // РОВНО форма, которой судья обошёл прежний построчный regex (`readonly\s+name:`):
    // обычное свойство интерфейса без модификатора — синтаксически ТАКОЕ ЖЕ свойство для
    // компилятора TypeScript, и страж обязан видеть его одинаково.
    const mutatedCode = injectFieldIntoRealInterface(realCode, 'dailyTotalKcal: number;');
    const result = guard(extractInterfaceFields(mutatedCode));
    expect(result.pass).toBe(false);
    expect(result.extra).toEqual(['dailyTotalKcal']);
  });

  it('ИСПЫТАНИЕ 3: убранное поле sourceLabel (недостающее) тоже красит страж — направление проверяется в ОБЕ стороны', async () => {
    const realCode = await readFile(FIELD_SET_FILE, 'utf8');
    const withoutSourceLabel = realCode.replace(/\s*readonly sourceLabel: string;\n/, '\n');
    expect(withoutSourceLabel).not.toBe(realCode); // страж на сам страж: замена реально произошла
    const result = guard(extractInterfaceFields(withoutSourceLabel));
    expect(result.pass).toBe(false);
    expect(result.missing).toEqual(['sourceLabel']);
  });

  it('ИСПЫТАНИЕ 4: необязательное поле (`badgeRendered?: boolean;`, без переименования) тоже опознаётся как то же самое поле, а не игнорируется', async () => {
    const realCode = await readFile(FIELD_SET_FILE, 'utf8');
    const madeOptional = realCode.replace('readonly badgeRendered: boolean;', 'readonly badgeRendered?: boolean;');
    expect(madeOptional).not.toBe(realCode);
    const result = guard(extractInterfaceFields(madeOptional));
    expect(result.pass).toBe(true); // имя то же — множество имён не изменилось, `?` не создаёт и не прячет поле
  });
});

/** Строки КОДА без комментариев — упоминание запрещённого имени в комментарии («мы его НЕ
 *  читаем») не является нарушением; тот же приём, что `tests/unit/consent-guard-source.test.ts`. */
function codeLinesOnly(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

describe('страж ADR-001 в поверхности этой фичи: model_estimate_kcal не читается сборкой карточки', () => {
  it('build-card-payload.ts и read-recognition-snapshot.ts не ЧИТАЮТ model_estimate_kcal / modelEstimateKcal (упоминание в комментарии — не нарушение)', async () => {
    const offenders: string[] = [];
    for (const relFile of ['apps/api/src/share/build-card-payload.ts', 'apps/api/src/share/read-recognition-snapshot.ts', 'apps/api/src/share/create-share-card.ts']) {
      const code = await readFile(path.join(ROOT, relFile), 'utf8');
      if (/model_estimate_kcal|modelEstimateKcal/.test(codeLinesOnly(code))) offenders.push(relFile);
    }
    expect(offenders).toEqual([]);
  });

  it('ИСПЫТАНИЕ: внедрённое чтение model_estimate_kcal В КОДЕ (не в комментарии) красит страж', () => {
    const mutatedCode = 'const kcalOnCard = recognition.model_estimate_kcal; // "более точное" число';
    expect(/model_estimate_kcal|modelEstimateKcal/.test(codeLinesOnly(mutatedCode))).toBe(true);
  });
});
