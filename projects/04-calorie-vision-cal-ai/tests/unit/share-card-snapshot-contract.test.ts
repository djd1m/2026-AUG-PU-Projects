// AC-share-card-and-growth-events-1 — контрактный тест (RV-share-card-and-growth-events-01,
// review-report.md): `computeCardSnapshotFromItems` (сборщик карточки) обязана понимать РЕАЛЬНУЮ
// персистентную форму, которую пишет `apps/recognizer` — а не форму, придуманную тестом.
//
// Вызывает РЕАЛЬНЫЙ `persistedItem` (`apps/recognizer/src/recognize/recognize-scan.ts`,
// экспортирован этой правкой ТОЛЬКО ради видимости для этого теста — поведение не менялось) с
// РЕАЛЬНЫМ типом `MatchedItem` (`apps/recognizer/src/match/port.js`), а не с самодельной копией
// формы, которую прежние тесты выдавали за неё. До правки `computeCardSnapshotFromItems`
// возвращала `null` на этом самом входе (проверено судьёй воспроизведением) — маршрут `POST
// /api/v1/share-cards` отвечал `503` на КАЖДОМ реальном завершённом скане.

import { describe, expect, it } from 'vitest';
import { persistedItem } from '../../apps/recognizer/src/recognize/recognize-scan.js';
import type { MatchedItem } from '../../apps/recognizer/src/match/port.js';
import { computeCardSnapshotFromItems } from '../../apps/api/src/share/read-recognition-snapshot.js';

/** `recognition.items` — jsonb: те же данные, что легли бы в базу, проходят через настоящую
 *  JSON-границу (в частности, `undefined`-поля вроде `parts` у несоставной позиции ИСЧЕЗАЮТ). */
function throughJsonColumn<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('контракт: computeCardSnapshotFromItems совместим с РЕАЛЬНЫМ persistedItem', () => {
  it('простая сопоставленная позиция (food_item_id есть, source_snapshot заполнен) даёт непустой Snapshot с верными числами', () => {
    const matched: MatchedItem = {
      foodItemId: '11111111-1111-1111-1111-111111111111',
      portionG: 200,
      sourceSnapshot: {
        source: 'USDA-FDC',
        source_id: '123456',
        name_en: 'Oatmeal with berries',
        kcal_per_100g: 210,
        protein_per_100g: 12.25,
        fat_per_100g: 6.0,
        carb_per_100g: 19.1,
      },
    };
    const item = persistedItem({ labelRu: 'Овсянка с ягодами', massG: 200 }, matched);
    const items = throughJsonColumn([item]) as never;

    const snapshot = computeCardSnapshotFromItems(items);

    expect(snapshot).not.toBeNull(); // ГЛАВНОЕ: до правки здесь был null
    expect(snapshot?.dishName).toBe('Овсянка с ягодами');
    expect(snapshot?.kcalTotal).toBe(420);
    expect(snapshot?.proteinTotal).toBe(24.5);
    expect(snapshot?.fatTotal).toBe(12.0);
    expect(snapshot?.carbTotal).toBe(38.2);
    expect(snapshot?.sourceLabel).toBe('USDA FDC · 200 г · 1 позиция');
  });

  it('позиция без совпадения (matched === undefined, как отдаёт NullMatchIngredientPort) не участвует — Snapshot пуст, а не с нулями', () => {
    const item = persistedItem({ labelRu: 'Неизвестное блюдо', massG: 100 }, undefined);
    const items = throughJsonColumn([item]) as never;

    expect(computeCardSnapshotFromItems(items)).toBeNull();
  });

  it('несколько сопоставленных позиций суммируются, а не берётся только первая', () => {
    const itemA = persistedItem(
      { labelRu: 'Рис', massG: 150 },
      { foodItemId: 'a', portionG: 150, sourceSnapshot: { source: 'USDA-FDC', source_id: '1', kcal_per_100g: 130, protein_per_100g: 2.7, fat_per_100g: 0.3, carb_per_100g: 28.0 } },
    );
    const itemB = persistedItem(
      { labelRu: 'Курица', massG: 100 },
      { foodItemId: 'b', portionG: 100, sourceSnapshot: { source: 'USDA-FDC', source_id: '2', kcal_per_100g: 165, protein_per_100g: 31.0, fat_per_100g: 3.6, carb_per_100g: 0 } },
    );
    const items = throughJsonColumn([itemA, itemB]) as never;

    const snapshot = computeCardSnapshotFromItems(items);
    expect(snapshot).not.toBeNull();
    // Рис: 150/100×130=195; Курица: 100/100×165=165; сумма 360.
    expect(snapshot?.kcalTotal).toBe(360);
    // "Верхняя" позиция для имени/источника — с БОЛЬШИМ kcal (Рис 195 > Курица 165).
    expect(snapshot?.dishName).toBe('Рис и Курица');
  });
});
