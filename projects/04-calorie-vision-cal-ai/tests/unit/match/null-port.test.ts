// AC-scan-pipeline-28 (контрактный тест ОТДЕЛЁН от поведенческого), AC-scan-pipeline-35.
//
// Контракт вынесен в `tests/contract/match-ingredient-port.contract.ts` (RV-source-and-
// correct-04, слепое ревью 2026-09-13): ОДИН И ТОТ ЖЕ вход и заголовок для заглушки И для
// `UsdaMatchIngredientPort` — раньше копия расходилась молча (другие входы, другой текст).

import { describe, expect, it, vi } from 'vitest';
import { createNullMatchIngredientPort } from '../../../apps/recognizer/src/match/null-port.js';
import { assertMatchIngredientPortContract, CONTRACT_TITLE } from '../../contract/match-ingredient-port.contract.js';

describe('контрактный тест MatchIngredientPort (готов принять ЛЮБУЮ реализацию)', () => {
  it(CONTRACT_TITLE, async () => {
    await assertMatchIngredientPortContract(createNullMatchIngredientPort());
  });
});

describe('поведенческий тест NullMatchIngredientPort (ИМЕННО эта фича)', () => {
  it('каждый элемент несёт food_item_id: null, parts отсутствует, сети нет', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const port = createNullMatchIngredientPort();
    const result = await port.match([{ labelRu: 'борщ', massG: 250 }]);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    expect(result).toHaveLength(1);
    expect(result[0]?.foodItemId).toBeNull();
    expect(result[0]?.sourceSnapshot).toBeNull();
    expect(result[0]?.parts).toBeUndefined();
  });

  it('пустой вход даёт пустой массив (не бросает и не выдумывает элемент)', async () => {
    const port = createNullMatchIngredientPort();
    expect(await port.match([])).toEqual([]);
  });
});
