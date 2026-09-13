// `ImportFdcDump` на настоящем PostgreSQL (AC-source-and-correct-1/2).

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { importFdcDump } from '../../../scripts/import-fdc.js';

const FIXTURE_DIR = fileURLToPath(new URL('../../fixtures/fdc', import.meta.url));

describe('importFdcDump (AC-source-and-correct-1/2)', () => {
  it('идемпотентен: два прогона подряд дают то же число строк, id не меняется, snapshot_date из аргумента', async () => {
    const pool = await migratedPool('n4-tests-import-fdc-1');
    await truncateAll(pool);

    const first = await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    expect(first.snapshotDate).toBe('2026-04-01');
    const rowsAfterFirst = await pool.query('SELECT id, import_snapshot_date::text AS date FROM food_item ORDER BY source_id');
    const idsAfterFirst = rowsAfterFirst.rows.map((r: { id: string }) => r.id);
    expect(rowsAfterFirst.rows.length).toBe(first.totalInTable);
    for (const row of rowsAfterFirst.rows as Array<{ date: string }>) expect(row.date).toBe('2026-04-01');

    // Второй прогон — С ДРУГОЙ датой снимка (проверяет, что дата берётся из АРГУМЕНТА
    // повторного прогона, а не «застревает» на первом значении), но тем же дампом.
    const second = await importFdcDump(pool, FIXTURE_DIR, '2026-05-01');
    const rowsAfterSecond = await pool.query('SELECT id, import_snapshot_date::text AS date FROM food_item ORDER BY source_id');
    const idsAfterSecond = rowsAfterSecond.rows.map((r: { id: string }) => r.id);

    expect(rowsAfterSecond.rows.length).toBe(rowsAfterFirst.rows.length); // ни одной новой строки
    expect(idsAfterSecond).toEqual(idsAfterFirst); // `id` НЕ изменился — на него ссылается food_synonym
    for (const row of rowsAfterSecond.rows as Array<{ date: string }>) expect(row.date).toBe('2026-05-01');
    expect(second.accepted).toBe(first.accepted);
  }, 30_000);

  it('запись без белка отвергается с причиной; запись без порции FNDDS переносится честно (default_portion_g IS NULL)', async () => {
    const pool = await migratedPool('n4-tests-import-fdc-2');
    await truncateAll(pool);

    const report = await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    const rejectedMissingProtein = report.rejected.find((r) => r.fdcId === '999001');
    expect(rejectedMissingProtein).toBeDefined();
    expect(rejectedMissingProtein?.reason).toMatch(/missing_nutrient/);

    const missingProteinRow = await pool.query('SELECT 1 FROM food_item WHERE source_id = $1', ['999001']);
    expect(missingProteinRow.rows).toHaveLength(0); // НЕ попала в food_item

    const missingPortionRow = await pool.query('SELECT default_portion_g, kcal_per_100g FROM food_item WHERE source_id = $1', ['999002']);
    expect(missingPortionRow.rows[0]?.default_portion_g).toBeNull(); // NULL, а не 100
    expect(missingPortionRow.rows[0]?.kcal_per_100g).not.toBeNull(); // но сама запись создана

    // Ни в одной строке ноль не подставлен вместо отсутствующего значения (нутриент 0 ≠ отсутствие).
    const zeroKcalRows = await pool.query('SELECT count(*)::int AS n FROM food_item WHERE kcal_per_100g = 0 AND source_id != $1', ['173468']); // соль легитимно 0 ккал
    expect(zeroKcalRows.rows[0]?.n).toBe(0);
  }, 30_000);

  it('отсутствующая дата снимка — отказ БЕЗ частичного импорта', async () => {
    const pool = await migratedPool('n4-tests-import-fdc-3');
    await truncateAll(pool);
    await expect(importFdcDump(pool, FIXTURE_DIR, undefined)).rejects.toThrow(/snapshot-date/);
    const rows = await pool.query('SELECT count(*)::int AS n FROM food_item');
    expect(rows.rows[0]?.n).toBe(0);
  }, 30_000);

  it('несуществующий каталог с дампами — отказ, называющий недостающий файл', async () => {
    const pool = await migratedPool('n4-tests-import-fdc-4');
    await truncateAll(pool);
    await expect(importFdcDump(pool, '/nonexistent/fdc/dump/path', '2026-04-01')).rejects.toThrow(/food\.csv/);
  }, 15_000);
});
