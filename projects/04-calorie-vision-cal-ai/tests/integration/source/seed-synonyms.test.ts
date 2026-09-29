// `SeedFoodSynonyms` на настоящем PostgreSQL (AC-source-and-correct-4/5, ADR-006 Confirmation).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SeedSynonymRow } from '@n4/shared';
import { loadFoodSynonyms, searchFoodCandidates } from '@n4/db';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { importFdcDump } from '../../../scripts/import-fdc.js';

const FIXTURE_DIR = fileURLToPath(new URL('../../fixtures/fdc', import.meta.url));
const SEED_PATH = fileURLToPath(new URL('../../../packages/db/seed/food-synonym.ru.json', import.meta.url));
const SEED_ROWS: SeedSynonymRow[] = JSON.parse(readFileSync(SEED_PATH, 'utf8'));

// AC-source-and-correct-5: 50 частых русских запросов ПРОТИВ ЭТОГО seed'а (ADR-006
// Confirmation) — покрытие не пригодности для произвольного меню, а отсутствия регресса.
const FREQUENT_QUERIES = [
  'гречка', 'рис', 'картошка', 'капуста', 'морковь', 'лук', 'масло оливковое', 'говядина',
  'куриная грудка', 'свинина', 'яйцо', 'молоко', 'творог', 'сметана', 'хлеб', 'сахар',
  'соль', 'яблоко', 'банан', 'огурец', 'помидор', 'макароны', 'лосось', 'свекла', 'горошек',
  'перец болгарский', 'чеснок', 'масло сливочное', 'йогурт', 'грибы', 'цветная капуста',
  'кабачок', 'тыква', 'чечевица', 'фасоль', 'мед', 'овсянка', 'кефир', 'сельдь', 'колбаса',
  'кукуруза', 'борщ', 'оливье', 'плов', 'солянка', 'винегрет', 'рагу овощное',
  'гречка вареная', 'рис отварной', 'картофель вареный',
];

describe('loadFoodSynonyms + coverage (AC-source-and-correct-4/5)', () => {
  // Число ОБНОВЛЕНО 2026-09-16: словарь расширен со 100 до 153 строк (коммит bca0916,
  // «индейку не находит» от владельца), и фикстура FDC дополнена 36 записями, на которые
  // новые синонимы ссылаются. Ожидание «ровно 100» было верно ровно до той правки — и
  // ПРОМОЛЧАЛО целые сутки, потому что интеграционные тесты в это время было опасно
  // запускать: они смотрели в боевую базу стенда (DEC-A-056).
  it('AC-4: создаёт ровно 153 строки food_synonym против импортированной фикстуры', async () => {
    const pool = await migratedPool('n4-tests-seed-synonyms-1');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');

    const result = await loadFoodSynonyms(pool, SEED_ROWS);
    expect(result.rejected).toEqual([]);
    expect(result.inserted).toBe(153);

    const count = await pool.query('SELECT count(*)::int AS n FROM food_synonym');
    expect(count.rows[0]?.n).toBe(153);
  }, 30_000);

  it('AC-4: база (не код) отвергает строку с ОБЕИМИ формами и строку с ОБЕИМИ пустыми', async () => {
    const pool = await migratedPool('n4-tests-seed-synonyms-2');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    const anyFoodItem = await pool.query<{ id: string }>('SELECT id FROM food_item LIMIT 1');
    const foodItemId = anyFoodItem.rows[0]?.id;
    expect(foodItemId).toBeDefined();

    // ОБА поля заполнены — вставка НАПРЯМУЮ, минуя код приложения.
    await expect(
      pool.query(
        `INSERT INTO food_synonym (name_ru, name_ru_normalized, food_item_id, recipe_parts, curated_by)
         VALUES ('тест-обе-формы', 'тест обе формы', $1, '[]'::jsonb, 'test')`,
        [foodItemId],
      ),
    ).rejects.toThrow(/food_synonym_exactly_one_form/);

    // ОБЕ формы пусты.
    await expect(
      pool.query(
        `INSERT INTO food_synonym (name_ru, name_ru_normalized, food_item_id, recipe_parts, curated_by)
         VALUES ('тест-ни-одной', 'тест ни одной', NULL, NULL, 'test')`,
      ),
    ).rejects.toThrow(/food_synonym_exactly_one_form/);
  }, 30_000);

  it('AC-5 / ADR-006: 50 частых русских запросов находят совпадение', async () => {
    const pool = await migratedPool('n4-tests-seed-synonyms-3');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    await loadFoodSynonyms(pool, SEED_ROWS);

    const misses: string[] = [];
    for (const query of FREQUENT_QUERIES) {
      const found = await searchFoodCandidates(pool, { query, mode: 'auto' });
      if (found.length === 0) misses.push(query);
    }
    expect(misses, `не найдено: ${misses.join(', ')}`).toEqual([]);
    expect(FREQUENT_QUERIES.length).toBeGreaterThanOrEqual(50);
  }, 30_000);

  it('ИСПЫТАНИЕ СТРАЖА (AC-5/ADR-006): удаление строк seed, покрывающих слово, красит покрытие (guard-must-be-able-to-fail.md)', async () => {
    // Все строки, содержащие «рис», «лук», «яйцо», «лосось» или «сельдь» (10 строк — тот
    // же масштаб мутации, что называет 04_refinement.md «удалить 10 строк seed»), удалены
    // ЦЕЛИКОМ, а не одна из нескольких: иначе триграммный поиск нашёл бы соседнюю форму
    // того же слова и мутация осталась бы незаметной.
    const REMOVE_WORDS = ['рис', 'лук', 'яйцо', 'лосось', 'сельдь'];
    // Удаляем по ОСНОВЕ слова, а не по точной форме. Причина названа в комментарии выше и
    // подтвердилась на практике 2026-09-16: после пополнения курации в словаре появилась
    // форма «яйца», строку «яйцо» удаление не задевало, и триграммный поиск по запросу
    // «яйцо» продолжал её находить — мутация переставала краснеть, то есть страж тихо
    // переставал быть стражем.
    const REMOVE_STEMS = ['рис', 'лук', 'яйц', 'лосос', 'сельд'];
    const mutatedSeed = SEED_ROWS.filter((row) => !REMOVE_STEMS.some((stem) => row.name_ru.toLowerCase().includes(stem)));
    const removedCount = SEED_ROWS.length - mutatedSeed.length;
    // ИЗМЕНЕНО 2026-09-16: было `toBe(10)`. Точное число описывало РАЗМЕР СЛОВАРЯ на день
    // написания, а не свойство, которое тест проверяет, — и ломалось при каждом пополнении
    // курации (со 100 до 153 строк оно стало 15). Проверяется то, ради чего мутация нужна:
    // она существенна (не одна строка) и уносит слова ЦЕЛИКОМ.
    expect(removedCount).toBeGreaterThanOrEqual(10);
    expect(mutatedSeed.some((row) => REMOVE_STEMS.some((stem) => row.name_ru.toLowerCase().includes(stem)))).toBe(false);

    const pool = await migratedPool('n4-tests-seed-synonyms-5');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    await loadFoodSynonyms(pool, mutatedSeed);

    const misses: string[] = [];
    for (const query of FREQUENT_QUERIES) {
      const found = await searchFoodCandidates(pool, { query, mode: 'auto' });
      if (found.length === 0) misses.push(query);
    }
    // КРАСНЫЙ на мутированном seed'е: слова, чьи строки удалены целиком, больше не находятся.
    expect(misses.sort()).toEqual([...REMOVE_WORDS].sort());
  }, 30_000);

  it('составное блюдо: сумма долей 0,9 отвергается при загрузке с названной причиной', async () => {
    const pool = await migratedPool('n4-tests-seed-synonyms-4');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    const badRow: SeedSynonymRow = {
      name_ru: 'плохой рецепт',
      recipe_parts: [
        { food_item_source_id: '168878', share: 0.5 },
        { food_item_source_id: '169705', share: 0.4 }, // сумма 0.9 — отклонение > 0.001
      ],
      curated_by: 'test',
    };
    const result = await loadFoodSynonyms(pool, [badRow]);
    expect(result.inserted).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toMatch(/share_sum_invalid/);
  }, 30_000);
});

// DEC-A-064 (2026-09-29): seed на стенде был применён ДВАЖДЫ и дал дубли `name_ru` — загрузка
// только дописывала. Теперь она заменяет строки тех же `curated_by`. Проверяется на настоящей
// базе: удаление и вставка под блокировкой — свойство транзакции, мок его не имеет.
describe('loadFoodSynonyms идемпотентна (DEC-A-064)', () => {
  const DUPLICATES_SQL = `SELECT name_ru_normalized, count(*)::int AS n FROM food_synonym GROUP BY name_ru_normalized HAVING count(*) > 1`;

  it('повторный запуск не создаёт дублей: 153 строки, вторая загрузка заменяет 153', async () => {
    const pool = await migratedPool('n4-tests-seed-idempotent-1');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');

    const first = await loadFoodSynonyms(pool, SEED_ROWS);
    const second = await loadFoodSynonyms(pool, SEED_ROWS);
    expect(first).toMatchObject({ inserted: 153, replaced: 0, rejected: [] });
    expect(second).toMatchObject({ inserted: 153, replaced: 153, rejected: [] });

    const count = await pool.query('SELECT count(*)::int AS n FROM food_synonym');
    expect(count.rows[0]?.n).toBe(153);
    expect((await pool.query(DUPLICATES_SQL)).rows).toEqual([]);
  }, 30_000);

  it('состояние стенда 29.09 (seed применён дважды прежним кодом) лечится одним запуском', async () => {
    const pool = await migratedPool('n4-tests-seed-idempotent-2');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    await loadFoodSynonyms(pool, SEED_ROWS);
    // Прежний код дописывал: воспроизводим второй проход копией строк мимо загрузчика.
    await pool.query(`INSERT INTO food_synonym (name_ru, name_ru_normalized, food_item_id, recipe_parts, curated_by, curated_at)
                      SELECT name_ru, name_ru_normalized, food_item_id, recipe_parts, curated_by, curated_at FROM food_synonym`);
    expect((await pool.query(DUPLICATES_SQL)).rows.length).toBeGreaterThan(0);

    const result = await loadFoodSynonyms(pool, SEED_ROWS);
    expect(result).toMatchObject({ inserted: 153, replaced: 306, rejected: [] });
    expect((await pool.query(DUPLICATES_SQL)).rows).toEqual([]);
  }, 30_000);

  it('строки ДРУГИХ кураторов не трогаются; отвергнутая загрузка не удаляет прежние строки', async () => {
    const pool = await migratedPool('n4-tests-seed-idempotent-3');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    await loadFoodSynonyms(pool, SEED_ROWS);
    const anyFoodItem = await pool.query<{ id: string }>('SELECT id FROM food_item LIMIT 1');
    await pool.query(
      `INSERT INTO food_synonym (name_ru, name_ru_normalized, food_item_id, curated_by) VALUES ('ручная запись', 'ручная запись', $1, 'operator-manual')`,
      [anyFoodItem.rows[0]?.id],
    );

    // Загрузка с одной неразрешимой строкой ОТКАТЫВАЕТСЯ целиком — вместе с DELETE.
    const broken: SeedSynonymRow[] = [...SEED_ROWS, { name_ru: 'несуществующее', food_item_source_id: '1', curated_by: SEED_ROWS[0]?.curated_by ?? 'x' }];
    const rejected = await loadFoodSynonyms(pool, broken);
    expect(rejected.inserted).toBe(0);
    expect(rejected.replaced).toBe(0);
    expect(rejected.rejected[0]?.reason).toMatch(/unresolved_fdc_id/);

    const count = await pool.query('SELECT count(*)::int AS n FROM food_synonym');
    expect(count.rows[0]?.n).toBe(154); // 153 seed + 1 ручная — ни одна не потеряна

    await loadFoodSynonyms(pool, SEED_ROWS);
    const manual = await pool.query(`SELECT count(*)::int AS n FROM food_synonym WHERE curated_by = 'operator-manual'`);
    expect(manual.rows[0]?.n).toBe(1);
  }, 30_000);

  it('КОНКУРЕНТНО: три одновременных запуска дают ровно 153 строки без дублей', async () => {
    const pool = await migratedPool('n4-tests-seed-idempotent-4');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');

    const results = await Promise.all([1, 2, 3].map(() => loadFoodSynonyms(pool, SEED_ROWS)));
    for (const result of results) expect(result.rejected).toEqual([]);

    const count = await pool.query('SELECT count(*)::int AS n FROM food_synonym');
    expect(count.rows[0]?.n).toBe(153);
    expect((await pool.query(DUPLICATES_SQL)).rows).toEqual([]);
  }, 60_000);

  it('дубль name_ru_normalized внутри файла отвергается ДО транзакции', async () => {
    const pool = await migratedPool('n4-tests-seed-idempotent-5');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    const withDuplicate: SeedSynonymRow[] = [...SEED_ROWS, { name_ru: 'Мёд', food_item_source_id: '169640', curated_by: 'test' }];
    const result = await loadFoodSynonyms(pool, withDuplicate);
    expect(result.inserted).toBe(0);
    expect(result.rejected).toEqual([{ nameRu: 'мед', reason: 'duplicate_name_ru_normalized' }]);
    const count = await pool.query('SELECT count(*)::int AS n FROM food_synonym');
    expect(count.rows[0]?.n).toBe(0);
  }, 30_000);
});
