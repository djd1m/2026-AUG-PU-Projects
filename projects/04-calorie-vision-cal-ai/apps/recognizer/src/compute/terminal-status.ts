// Терминальный статус после сопоставления (FR-source-and-correct-7, ADR-001
// Confirmation (2), DEC-A-023). `done` при нуле ссылок на `food_item` НЕВОЗМОЖЕН.

export type MatchTerminalStatus = { readonly status: 'done' } | { readonly status: 'failed'; readonly failureReason: 'no_food_matched' };

/** `anyMatched` — сопоставлена ХОТЯ БЫ одна позиция (напрямую или через `parts[]`). */
export function terminalStatusForMatch(anyMatched: boolean): MatchTerminalStatus {
  if (!anyMatched) return { status: 'failed', failureReason: 'no_food_matched' };
  return { status: 'done' };
}
