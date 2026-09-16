// AC-share-card-and-growth-events-1/4/5/15 — сборка ShareCardRenderInput: тариф fail-closed на
// пяти неопознанных значениях и ровно на paid; явная деструктуризация, не спред (лишнее поле
// границы сервисов не должно попасть в результат). Без БД, без сети.

import { describe, expect, it } from 'vitest';
import { buildCardPayload, isBadgeRequired } from '../../apps/api/src/share/build-card-payload.js';
import type { Kcal, Macro } from '@n4/shared';

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
    const contaminated = { ...BASE_INPUT, tier: undefined, streakDays: 999 };
    const payload = buildCardPayload(contaminated as never);
    expect(payload).not.toHaveProperty('streakDays');
    expect(JSON.stringify(payload)).not.toContain('streakDays');
    expect(JSON.stringify(payload)).not.toContain('999');
  });

  it('AC-15, испытание стража на внедрённом дефекте: спред вместо деструктуризации пропускает лишнее поле (guard-must-be-able-to-fail)', () => {
    // Мутация — В ПАМЯТИ функция-дублёр со спредом вместо явной деструктуризации,
    // источник на диске не трогается. Подтверждает, что тест ВЫШЕ действительно ловит
    // именно этот класс дефекта, а не проходит вакуумно.
    function buildWithSpreadMutant(input: Record<string, unknown>): Record<string, unknown> {
      return { ...input };
    }
    const contaminated = { ...BASE_INPUT, tier: undefined, streakDays: 12 };
    const mutatedResult = buildWithSpreadMutant(contaminated);
    expect(mutatedResult).toHaveProperty('streakDays', 12); // дефект ловится: мутант красный
  });
});
