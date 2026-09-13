// AC-scan-pipeline-28 (контрактный тест ОТДЕЛЁН от поведенческого), AC-scan-pipeline-35.

import { describe, expect, it, vi } from 'vitest';
import { createNullMatchIngredientPort } from '../../../apps/recognizer/src/match/null-port.js';

describe('контрактный тест MatchIngredientPort (готов принять ЛЮБУЮ реализацию)', () => {
  it('длина и порядок ответа совпадают со входом; portion_g положителен', async () => {
    const port = createNullMatchIngredientPort();
    const input = [
      { labelRu: 'борщ', massG: 250 },
      { labelRu: 'омлет', massG: 120 },
      { labelRu: 'салат', massG: 80 },
    ];
    const result = await port.match(input);
    expect(result).toHaveLength(input.length);
    result.forEach((item, index) => {
      expect(item.portionG).toBe(input[index]?.massG);
      expect(item.portionG).toBeGreaterThan(0);
      if (item.parts !== undefined) {
        const total = item.parts.reduce((sum, part) => sum + Number(part.share), 0);
        expect(total).toBeCloseTo(1, 5);
      }
    });
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
