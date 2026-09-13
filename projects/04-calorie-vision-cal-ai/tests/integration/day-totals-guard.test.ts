// Страж по ИСХОДНИКУ для day-totals.ts (AC-diary-and-streak-18, `.claude/rules/
// guard-must-be-able-to-fail.md`): итог дня агрегируется ТОЛЬКО из персистированных колонок
// `diary_entry`, таблица `food_item` не участвует ни при каком условии. Живёт рядом с
// интеграционными тестами (05_completion.md, Criterion coverage) — свойство исходника, а не
// поведение одного прогона, но проверяется той же командой `npm run test:integration`, что и
// остальной контур этой фичи.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DAY_TOTALS_FILE = path.join(ROOT, 'apps/api/src/diary/day-totals.ts');

/** Строки кода без комментариев — упоминание food_item в комментарии не является обращением. */
function codeLines(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

function readsFoodItem(code: string): boolean {
  return /food_item/.test(codeLines(code));
}

describe('страж AC-diary-and-streak-18: итог дня не читает живую базу продуктов', () => {
  it('страж отклоняет пересчёт итога через живую таблицу food_item', async () => {
    const source = await readFile(DAY_TOTALS_FILE, 'utf8');

    // Зелёный на РЕАЛЬНОМ файле: ни SQL, ни имя таблицы food_item нигде в исполняемом коде.
    expect(readsFoodItem(source)).toBe(false);
    expect(codeLines(source)).toMatch(/SELECT meal_slot, kcal_total, protein_total, fat_total, carb_total\s*\n\s*FROM diary_entry/);

    // ИСПЫТАНИЕ СТРАЖА НА ВНЕДРЁННОМ ДЕФЕКТЕ (guard-must-be-able-to-fail.md): страж, ни разу
    // не показавший красное, стражем не является. Мутация — В ПАМЯТИ, файл на диске не
    // трогается. Дефект: замена суммы персистированных колонок на пересчёт через JOIN food_item
    // по items->>'food_item_id' (переимпорт базы задним числом менял бы уже показанный итог).
    const mutatedJoiningFoodItem = source.replace(
      'FROM diary_entry\n  WHERE owner_key = $1 AND eaten_on = $2 AND deleted_at IS NULL',
      `FROM diary_entry de
  JOIN food_item fi ON fi.id = (de.items->0->>'food_item_id')::uuid
  WHERE owner_key = $1 AND eaten_on = $2 AND deleted_at IS NULL`,
    );
    expect(mutatedJoiningFoodItem).not.toBe(source); // подтверждает, что замена реально произошла
    expect(readsFoodItem(mutatedJoiningFoodItem)).toBe(true); // КРАСНЫЙ на дефекте

    // Восстановление — снова ЗЕЛЁНЫЙ (обе строки квитанции: дефект → красный, восстановлено → зелёный).
    expect(readsFoodItem(source)).toBe(false);
  });
});
