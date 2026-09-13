// Построение запроса `POST /api/v1/scans/{id}/correct` (RV-source-and-correct-01, слепое
// ревью 2026-09-13) — ВЫНЕСЕНО из `[id]/page.tsx` в чистую функцию именно затем, чтобы
// пять операций экрана результата (степпер, замена по запросу, замена по id, удаление,
// разрешение расхождения) были проверяемы БЕЗ браузера/DOM: страница делает сетевой
// вызов, а эта функция решает, ЧТО в нём отправить — и это решение детерминировано и не
// требует React вовсе.

export type CorrectAction =
  | { readonly op: 'set_portion'; readonly index: number; readonly massG: number }
  | { readonly op: 'delete_item'; readonly index: number }
  | { readonly op: 'replace_item_search'; readonly query: string }
  | { readonly op: 'replace_item_select'; readonly index: number; readonly foodItemId: string }
  | { readonly op: 'resolve_conflict' };

export interface CorrectRequest {
  readonly url: string;
  readonly body: Record<string, unknown>;
}

export function buildCorrectRequest(scanId: string, action: CorrectAction): CorrectRequest {
  const url = `/api/v1/scans/${scanId}/correct`;
  switch (action.op) {
    case 'set_portion':
      return { url, body: { op: 'set_portion', index: action.index, mass_g: action.massG } };
    case 'delete_item':
      return { url, body: { op: 'delete_item', index: action.index } };
    case 'replace_item_search':
      // ЧИСТЫЙ поиск — состав скана не меняется (FR-source-and-correct-10): тело несёт
      // ТОЛЬКО `query`, без `index`/`food_item_id`.
      return { url, body: { op: 'replace_item', query: action.query } };
    case 'replace_item_select':
      return { url, body: { op: 'replace_item', index: action.index, food_item_id: action.foodItemId } };
    case 'resolve_conflict':
      // Единственное допустимое значение — 'take_db' (DEC-A-023).
      return { url, body: { op: 'resolve_conflict', choice: 'take_db' } };
  }
}
