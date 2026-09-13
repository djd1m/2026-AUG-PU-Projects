// AC-share-card-and-growth-events-14 — GuardShareCardFieldSet: множество полей
// `ShareCardRenderInput` (`packages/shared/src/domain/share-card.ts`) РОВНО из восьми имён,
// проверенное РАВЕНСТВОМ множеств, а не подмножеством (иначе новое поле того же смысла,
// например `dailyTotalKcal`, прошло бы незамеченным — тот же урок, что ADR-001).
//
// Испытан на ДВУХ внедрённых дефектах (`04_refinement.md`, «Стражи по исходнику», и
// `.claude/rules/guard-must-be-able-to-fail.md`): страж, ни разу не показавший красное, стражем
// не является.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIELD_SET_FILE = path.join(ROOT, 'packages/shared/src/domain/share-card.ts');
const REFERENCE_FIELDS = ['dishName', 'kcal', 'proteinG', 'fatG', 'carbG', 'sourceLabel', 'badgeRendered', 'photoUrl'];

/** Извлекает имена полей ИНТЕРФЕЙСА `ShareCardRenderInput` — не всего файла — построчным
 *  разбором его тела (страж слоя 1: инвариант локальный, полноценный AST не требуется). */
function extractInterfaceFields(code: string): string[] {
  const start = code.indexOf('export interface ShareCardRenderInput {');
  if (start === -1) throw new Error('интерфейс ShareCardRenderInput не найден в файле');
  const end = code.indexOf('\n}', start);
  const body = code.slice(start, end);
  const fields: string[] = [];
  for (const line of body.split('\n')) {
    const match = /readonly\s+([A-Za-z_$][\w$]*)\s*:/.exec(line);
    if (match?.[1] !== undefined) fields.push(match[1]);
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

  it('ИСПЫТАНИЕ 1: внедрённое ЛИШНЕЕ поле dailyTotalKcal красит страж (guard-must-be-able-to-fail)', () => {
    const mutated = extractInterfaceFields(`
      export interface ShareCardRenderInput {
        readonly dishName: string;
        readonly kcal: number;
        readonly proteinG: number;
        readonly fatG: number;
        readonly carbG: number;
        readonly sourceLabel: string;
        readonly badgeRendered: boolean;
        readonly photoUrl: string;
        readonly dailyTotalKcal: number;
      }
    `);
    const result = guard(mutated);
    expect(result.pass).toBe(false);
    expect(result.extra).toEqual(['dailyTotalKcal']);
  });

  it('ИСПЫТАНИЕ 2: убранное поле sourceLabel (недостающее) тоже красит страж — направление проверяется в ОБЕ стороны', () => {
    const mutated = extractInterfaceFields(`
      export interface ShareCardRenderInput {
        readonly dishName: string;
        readonly kcal: number;
        readonly proteinG: number;
        readonly fatG: number;
        readonly carbG: number;
        readonly badgeRendered: boolean;
        readonly photoUrl: string;
      }
    `);
    const result = guard(mutated);
    expect(result.pass).toBe(false);
    expect(result.missing).toEqual(['sourceLabel']);
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
