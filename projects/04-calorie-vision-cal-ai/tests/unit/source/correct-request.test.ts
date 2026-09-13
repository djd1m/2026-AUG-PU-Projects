// `buildCorrectRequest` — RV-source-and-correct-01 (слепое ревью, 2026-09-13): «степпер,
// замена и удаление отсутствуют, кнопки разрешения расхождения не имеют обработчиков».
// Проверяет, что каждое действие экрана результата строит ПРАВИЛЬНЫЙ запрос к
// `POST /api/v1/scans/{id}/correct` — без браузера/DOM, потому что решение «что
// отправить» не зависит от React.

import { describe, expect, it } from 'vitest';
import { buildCorrectRequest } from '../../../apps/web/app/result/correct-request';

const SCAN_ID = 'scan-123';
const URL = `/api/v1/scans/${SCAN_ID}/correct`;

describe('buildCorrectRequest (RV-source-and-correct-01)', () => {
  it('set_portion: степпер несёт index и mass_g', () => {
    expect(buildCorrectRequest(SCAN_ID, { op: 'set_portion', index: 1, massG: 220 })).toEqual({
      url: URL,
      body: { op: 'set_portion', index: 1, mass_g: 220 },
    });
  });

  it('delete_item: несёт index', () => {
    expect(buildCorrectRequest(SCAN_ID, { op: 'delete_item', index: 2 })).toEqual({
      url: URL,
      body: { op: 'delete_item', index: 2 },
    });
  });

  it('replace_item_search: ЧИСТЫЙ поиск — только query, без index/food_item_id (состав скана не меняется)', () => {
    const result = buildCorrectRequest(SCAN_ID, { op: 'replace_item_search', query: 'гречка' });
    expect(result).toEqual({ url: URL, body: { op: 'replace_item', query: 'гречка' } });
    expect(result.body).not.toHaveProperty('index');
    expect(result.body).not.toHaveProperty('food_item_id');
  });

  it('replace_item_select: несёт index и food_item_id, без query', () => {
    const result = buildCorrectRequest(SCAN_ID, { op: 'replace_item_select', index: 0, foodItemId: 'food-1' });
    expect(result).toEqual({ url: URL, body: { op: 'replace_item', index: 0, food_item_id: 'food-1' } });
    expect(result.body).not.toHaveProperty('query');
  });

  it('resolve_conflict: choice ВСЕГДА take_db — единственное допустимое значение (DEC-A-023)', () => {
    expect(buildCorrectRequest(SCAN_ID, { op: 'resolve_conflict' })).toEqual({
      url: URL,
      body: { op: 'resolve_conflict', choice: 'take_db' },
    });
  });

  it('URL адресует ИМЕННО переданный scan_id, а не константу', () => {
    expect(buildCorrectRequest('other-scan', { op: 'delete_item', index: 0 }).url).toBe('/api/v1/scans/other-scan/correct');
  });
});
