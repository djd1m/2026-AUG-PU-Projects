// AC-share-card-and-growth-events-1/4/5/15 — сборка ShareCardRenderInput: тариф fail-closed на
// пяти неопознанных значениях и ровно на paid; явная деструктуризация, не спред (лишнее поле
// границы сервисов не должно попасть в результат). Без БД, без сети. Испытание AC-15 —
// мутацией ТЕКСТА РЕАЛЬНОГО файла, см. блок в конце (RV-share-card-and-growth-events-04).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as shared from '@n4/shared';
import type { Kcal, Macro } from '@n4/shared';
import { buildCardPayload, isBadgeRequired } from '../../apps/api/src/share/build-card-payload.js';
import { renderCardImage } from '../../apps/api/src/share/render-card-image.js';

const BASE_INPUT = {
  dishName: 'Овсянка с ягодами',
  items: [
    { label: 'овсянка', massG: 180, kcal: 320 },
    { label: 'черника', massG: 60, kcal: 100 },
  ],
  kcal: 420 as Kcal,
  proteinG: 24.5 as Macro,
  fatG: 12.0 as Macro,
  carbG: 38.2 as Macro,
  sourceLabel: 'USDA FDC #123456 · 180 г',
  photoUrl: 'https://minio.internal/photo.jpg',
};

describe('isBadgeRequired: fail-closed на пяти неопознанных значениях (AC-4, honest-configuration CFG-I3/I6)', () => {
  it.each([
    ['free', 'free' as unknown],
    ['NULL', null],
    ["'PAID' в другом регистре", 'PAID'],
    ['пустая строка', ''],
    ['отсутствие строки account вовсе', undefined],
  ])('%s → badgeRendered = true', (_label, tier) => {
    expect(isBadgeRequired(tier)).toBe(true);
  });

  it('AC-5: РОВНО paid снимает бейдж — страж умеет и не срабатывать', () => {
    expect(isBadgeRequired('paid')).toBe(false);
  });
});

describe('buildCardPayload: тариф читается только с сервера, клиентское поле игнорируется', () => {
  it('AC-4: клиентское tariff: "paid" в теле проигнорировано, если сервер прочитал не paid', () => {
    const payload = buildCardPayload({ ...BASE_INPUT, tier: 'free', tariff: 'paid' } as never);
    expect(payload.badgeRendered).toBe(true);
  });

  it('AC-5: badgeRendered = false только когда серверный tier строго paid', () => {
    const payload = buildCardPayload({ ...BASE_INPUT, tier: 'paid' });
    expect(payload.badgeRendered).toBe(false);
  });

  it('AC-1: собирает ровно девять полей с числами и строкой источника из Snapshot', () => {
    const payload = buildCardPayload({ ...BASE_INPUT, tier: undefined });
    expect(payload).toEqual({
      dishName: 'Овсянка с ягодами',
      items: [
        { label: 'овсянка', massG: 180, kcal: 320 },
        { label: 'черника', massG: 60, kcal: 100 },
      ],
      kcal: 420,
      proteinG: 24.5,
      fatG: 12.0,
      carbG: 38.2,
      sourceLabel: 'USDA FDC #123456 · 180 г',
      badgeRendered: true,
      photoUrl: 'https://minio.internal/photo.jpg',
    });
    expect(Object.keys(payload).sort()).toEqual(
      ['badgeRendered', 'carbG', 'dishName', 'fatG', 'items', 'kcal', 'photoUrl', 'proteinG', 'sourceLabel'].sort(),
    );
  });

  it('sanitizeForCardText применяется к dishName (60) и sourceLabel (80) до попадания в результат', () => {
    const payload = buildCardPayload({ ...BASE_INPUT, dishName: 'д'.repeat(70), tier: undefined });
    expect(payload.dishName.length).toBeLessThanOrEqual(60);
    expect(payload.dishName.endsWith('…')).toBe(true);
  });

  it('AC-15 (E12): лишнее поле входа (streakDays) через границу сервисов НЕ попадает в результат — явная деструктуризация, не спред', () => {
    expect(extraFieldLeaks(buildCardPayload as unknown as BuildFn)).toEqual([]);
  });
});

// ─── AC-15: испытание стража мутацией РЕАЛЬНОГО файла (RV-share-card-and-growth-events-04) ───
//
// Прежнее «испытание» гоняло функцию-дублёр `{ ...input }`, напечатанную в самом тесте, — её
// assertion зеленел независимо от того, ловит ли защита настоящего `buildCardPayload` что-либо.
// Теперь мутация применяется к ТЕКСТУ РЕАЛЬНОГО `apps/api/src/share/build-card-payload.ts`
// (читается с диска, правится в памяти, диск не трогается — тот же приём, что
// `share-card-field-set-guard.test.ts` для AC-14), текст СОБИРАЕТСЯ компилятором TypeScript
// (`ts.transpileModule`) и исполняется с НАСТОЯЩИМ `@n4/shared`. К мутанту применяется ТА ЖЕ
// проверка `extraFieldLeaks`, что и к настоящей функции выше, и она обязана покраснеть.
// Контроль: тот же загрузчик на НЕмутированном тексте даёт зелёное — иначе краснота могла бы
// быть артефактом загрузчика, а не дефекта (`.claude/rules/guard-must-be-able-to-fail.md`).

type BuildFn = (input: Record<string, unknown>) => Record<string, unknown>;

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BUILD_CARD_PAYLOAD_FILE = path.join(ROOT, 'apps/api/src/share/build-card-payload.ts');

/** Лишнее поле, приехавшее через границу сервисов (JSON, а не тип TypeScript). */
const EXTRA_FIELD = 'streakDays';
const EXTRA_VALUE = 987_654;

/** Та самая проверка AC-15: пустой список — поле не протекло; иначе — названные нарушения. */
function extraFieldLeaks(build: BuildFn): string[] {
  const payload = build({ ...BASE_INPUT, tier: undefined, [EXTRA_FIELD]: EXTRA_VALUE });
  const serialized = JSON.stringify(payload);
  const leaks: string[] = [];
  if (Object.prototype.hasOwnProperty.call(payload, EXTRA_FIELD)) leaks.push(`свойство ${EXTRA_FIELD}`);
  if (serialized.includes(EXTRA_FIELD)) leaks.push(`имя ${EXTRA_FIELD} в JSON`);
  if (serialized.includes(String(EXTRA_VALUE))) leaks.push(`значение ${EXTRA_VALUE} в JSON`);
  return leaks;
}

/** Собирает ТЕКСТ модуля компилятором TypeScript и исполняет его с настоящим `@n4/shared`. */
function loadBuildCardPayloadFromText(code: string): BuildFn {
  const { outputText } = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const moduleExports: Record<string, unknown> = {};
  const requireShim = (id: string): unknown => {
    if (id === '@n4/shared') return shared;
    throw new Error(`неожиданный импорт в build-card-payload.ts: ${id}`);
  };
  new Function('require', 'exports', outputText)(requireShim, moduleExports);
  const fn = moduleExports['buildCardPayload'];
  if (typeof fn !== 'function') throw new Error('buildCardPayload не экспортирован собранным текстом');
  return fn as BuildFn;
}

const RETURN_MARKER = '  return {\n    dishName: sanitizeForCardText(dishName, DISH_NAME_MAX_LEN),';

describe('AC-15, испытание стража мутацией РЕАЛЬНОГО build-card-payload.ts (RV-share-card-and-growth-events-04)', () => {
  it('контроль: НЕмутированный текст реального файла, собранный тем же загрузчиком, проходит проверку', async () => {
    const realCode = await readFile(BUILD_CARD_PAYLOAD_FILE, 'utf8');
    expect(extraFieldLeaks(loadBuildCardPayloadFromText(realCode))).toEqual([]);
  });

  it('МУТАЦИЯ 1: спред входа в результат (`return { ...input, … }`) красит проверку AC-15', async () => {
    const realCode = await readFile(BUILD_CARD_PAYLOAD_FILE, 'utf8');
    const mutated = realCode.replace(RETURN_MARKER, RETURN_MARKER.replace('  return {\n', '  return {\n    ...input,\n'));
    expect(mutated).not.toBe(realCode); // страж на сам страж: мутация реально применена
    expect(extraFieldLeaks(loadBuildCardPayloadFromText(mutated))).toEqual([
      `свойство ${EXTRA_FIELD}`,
      `имя ${EXTRA_FIELD} в JSON`,
      `значение ${EXTRA_VALUE} в JSON`,
    ]);
  });

  it('МУТАЦИЯ 2: деструктуризация с остатком (`...rest`), разлитым в результат, красит проверку AC-15', async () => {
    const realCode = await readFile(BUILD_CARD_PAYLOAD_FILE, 'utf8');
    const destructuring = 'const { dishName, items, kcal, proteinG, fatG, carbG, sourceLabel, photoUrl, tier } = input;';
    const mutated = realCode
      .replace(destructuring, destructuring.replace('tier }', 'tier, ...rest }'))
      .replace(RETURN_MARKER, RETURN_MARKER.replace('  return {\n', '  return {\n    ...rest,\n'));
    expect(mutated.includes('...rest }') && mutated.includes('    ...rest,\n')).toBe(true);
    expect(extraFieldLeaks(loadBuildCardPayloadFromText(mutated))).not.toEqual([]);
  });
});

describe('AC-15 на выходе НАСТОЯЩЕГО рендера: renderCardImage читает только разрешённые поля', () => {
  it('рендер с payload, собранным из загрязнённого входа, не обращается ни к одному полю вне ALLOWED_SHARE_CARD_FIELDS', async () => {
    const payload = buildCardPayload({ ...BASE_INPUT, tier: undefined, [EXTRA_FIELD]: EXTRA_VALUE } as never);
    const readKeys = new Set<string>();
    const tracked = new Proxy(payload, {
      get(target, key, receiver) {
        if (typeof key === 'string') readKeys.add(key);
        return Reflect.get(target, key, receiver);
      },
    });
    const photo = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 120, g: 180, b: 90 } } })
      .jpeg()
      .toBuffer();
    const fetchImpl = (async () => new Response(photo, { status: 200 })) as unknown as typeof fetch;
    const jpeg = await renderCardImage(tracked, { fetchImpl });
    expect(jpeg.subarray(0, 2).toString('hex')).toBe('ffd8'); // рендер действительно выполнен
    expect(readKeys.has('kcal') && readKeys.has('dishName')).toBe(true); // слежение за чтением не вакуумно
    const allowed = new Set<string>(shared.ALLOWED_SHARE_CARD_FIELDS);
    expect([...readKeys].filter((k) => !allowed.has(k))).toEqual([]);
    expect(readKeys.has(EXTRA_FIELD)).toBe(false);
  });
});
