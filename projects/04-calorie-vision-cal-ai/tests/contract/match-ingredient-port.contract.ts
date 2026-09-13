// Контрактный тест `MatchIngredientPort` (AC-scan-pipeline-28, FR-source-and-correct-4,
// AC-source-and-correct-8). «Готов принять ЛЮБУЮ реализацию»: сравнивает форму ответа
// (длина, порядок, положительность `portion_g`, сумма `parts[].share`), а не поведение
// конкретного порта.
//
// RV-source-and-correct-04 (слепое ревью, 2026-09-13): контракт был СКОПИРОВАН в
// `tests/integration/source/usda-match-port.test.ts` с ИЗМЕНЁННЫМИ входами
// («гречка вареная» вместо «салат») и ИЗМЕНЁННЫМ заголовком — то есть перестал быть «тем
// же текстом», хотя FR-source-and-correct-4 требует прогона БЕЗ ИЗМЕНЕНИЙ. Вынесен СЮДА
// ОДИН РАЗ — `tests/unit/match/null-port.test.ts` (заглушка) и
// `tests/integration/source/usda-match-port.test.ts` (реализация) вызывают ОДНУ и ТУ ЖЕ
// функцию с ОДНИМ и ТЕМ ЖЕ входом, вместо двух копий, которые расходятся молча.

import { expect } from 'vitest';
import type { MatchIngredientPort } from '../../apps/recognizer/src/match/port.js';

export const CONTRACT_TITLE = 'длина и порядок ответа совпадают со входом; portion_g положителен';

export const CONTRACT_INPUT = [
  { labelRu: 'борщ', massG: 250 },
  { labelRu: 'омлет', massG: 120 },
  { labelRu: 'салат', massG: 80 },
];

export async function assertMatchIngredientPortContract(port: MatchIngredientPort): Promise<void> {
  const result = await port.match(CONTRACT_INPUT);
  expect(result).toHaveLength(CONTRACT_INPUT.length);
  result.forEach((item, index) => {
    expect(item.portionG).toBe(CONTRACT_INPUT[index]?.massG);
    expect(item.portionG).toBeGreaterThan(0);
    if (item.parts !== undefined) {
      const total = item.parts.reduce((sum, part) => sum + Number(part.share), 0);
      expect(total).toBeCloseTo(1, 5);
    }
  });
}
