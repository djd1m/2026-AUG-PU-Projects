// Дефект, найденный владельцем 13.09.2026: «индейку находит, но не заменяет свинину,
// кнопка „заменить“ не работает». Замена ПРИМЕНЯЛАСЬ (снимок и числа менялись), но
// `label_ru` оставался прежним — на экране над числами индейки стояло слово «Свинина»,
// и единственный наблюдаемый признак успеха отсутствовал.
//
// Слой — unit: подпись выбирается из ДВУХ значений записи базы, поиск базы для этого не
// нужен; `lookupFoodItem` подменяется через `deps` (ADR-001: имя и числа берутся ТОЛЬКО
// из базы, присланное клиентом название игнорируется).

import { describe, expect, it } from 'vitest';
import { applyCorrectOp, buildReplacedLabel, type FoodItemLookupFn } from '../../../apps/api/src/correct/apply-op.js';
import type { CurrentScanRow } from '../../../apps/api/src/correct/apply-op.js';

const TURKEY = {
  source_id: '171098',
  name_en: 'Turkey, whole, breast, meat only, raw',
  name_ru: 'индейка',
  kcal_per_100g: 114,
  protein_per_100g: 23.7,
  fat_per_100g: 1.5,
  carb_per_100g: 0.1,
  import_snapshot_date: '2026-04-30',
};

const lookup: FoodItemLookupFn = async () => TURKEY;

function scanWithPork(): CurrentScanRow {
  return {
    items: [
      {
        label_ru: 'Свинина',
        mass_g: 150,
        original_mass_g: 150,
        candidates: ['свинина', 'тушеная свинина'],
        unmatched: false,
        food_item_id: 'pork-id',
        source_snapshot: {
          source: 'USDA-FDC',
          source_id: '168230',
          name_en: 'Pork, fresh, loin, whole, separable lean only, raw',
          kcal_per_100g: 143,
          protein_per_100g: 21,
          fat_per_100g: 5.9,
          carb_per_100g: 0,
          portion_g: 150,
          import_snapshot_date: '2026-04-30',
        },
        kcal: 215,
        protein: 31.5,
        fat: 8.9,
        carb: 0,
      },
    ],
    model_estimate_kcal: 600,
    conflict_flag: false,
    conflict_choice: null,
    conflict_choice_at: null,
    corrections: [],
  };
}

describe('replace_item: подпись позиции переживать замену НЕ может', () => {
  it('label_ru становится русским названием НОВОЙ записи, а не остаётся прежним', async () => {
    const applied = await applyCorrectOp({} as never, scanWithPork(), 'replace_item', { op: 'replace_item', index: 0, food_item_id: 'turkey-id' }, { lookupFoodItem: lookup });
    expect(applied.kind).toBe('ok');
    if (applied.kind !== 'ok') return;
    const item = applied.result.items[0]!;
    expect(item.label_ru).toBe('Индейка');
    expect(item.food_item_id).toBe('turkey-id');
    expect(item.source_snapshot?.source_id).toBe('171098');
    // Числа — из новой записи: 114 ккал/100 г × 1,5 порции.
    expect(item.kcal).toBe(171);
  });

  it('догадки модели о ПРЕЖНЕМ продукте не переживают замену', async () => {
    const applied = await applyCorrectOp({} as never, scanWithPork(), 'replace_item', { op: 'replace_item', index: 0, food_item_id: 'turkey-id' }, { lookupFoodItem: lookup });
    if (applied.kind !== 'ok') throw new Error('замена не применилась');
    expect(applied.result.items[0]!.candidates).toBeUndefined();
  });

  it('журнал правки называет ОБЕ подписи — прежнюю и новую', async () => {
    const applied = await applyCorrectOp({} as never, scanWithPork(), 'replace_item', { op: 'replace_item', index: 0, food_item_id: 'turkey-id' }, { lookupFoodItem: lookup });
    if (applied.kind !== 'ok') throw new Error('замена не применилась');
    const record = applied.result.corrections[0] as { from: { label_ru: string }; to: { label_ru: string } };
    expect(record.from.label_ru).toBe('Свинина');
    expect(record.to.label_ru).toBe('Индейка');
  });

  it('без русской курации подписью становится английское название записи, а не пустота', () => {
    expect(buildReplacedLabel({ name_ru: null, name_en: 'Turkey, whole, breast' })).toBe('Turkey, whole, breast');
    expect(buildReplacedLabel({ name_ru: '   ', name_en: 'Turkey, whole, breast' })).toBe('Turkey, whole, breast');
  });
});
