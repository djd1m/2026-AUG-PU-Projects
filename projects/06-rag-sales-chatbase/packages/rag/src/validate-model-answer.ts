// ValidateModelAnswer (Pseudocode, FR-ANSWER-002, ADR-003 — барьер ПОСЛЕ модели) — написано заново (ADR-016).
// Модель не гарантирует следования схеме и правилам; показывается только то, что прошло ЭТУ проверку.
// Всё, что не «answered + непустой текст + непустые цитаты ТОЛЬКО из выданных меток», — unknown.
import { ANSWER_TEXT_MAX_CHARS } from './constants.js';

export type ValidatedAnswer =
  | { status: 'answered'; text: string; citations: string[] }
  | { status: 'unknown'; why: 'not_json' | 'no_status' | 'not_found' | 'unknown_status' | 'empty_text' | 'no_citations' | 'foreign_citation' };

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function validateModelAnswer(raw: unknown, labels: readonly string[]): ValidatedAnswer {
  if (!isObject(raw)) return { status: 'unknown', why: 'not_json' };
  if (!('status' in raw) || typeof raw.status !== 'string') return { status: 'unknown', why: 'no_status' };
  if (raw.status === 'not_found') return { status: 'unknown', why: 'not_found' };
  if (raw.status !== 'answered') return { status: 'unknown', why: 'unknown_status' };
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!text) return { status: 'unknown', why: 'empty_text' };
  const citations = Array.isArray(raw.citations) ? raw.citations : [];
  if (!citations.length) return { status: 'unknown', why: 'no_citations' };
  // Проверка цитат: каждая — строка из меток ЭТОГО контекста (F1…Fk). F9, UUID чужого фрагмента, «F1 » — чужие.
  if (citations.some((c) => typeof c !== 'string' || !labels.includes(c))) return { status: 'unknown', why: 'foreign_citation' };
  const unique = [...new Set(citations as string[])];
  return { status: 'answered', text: Array.from(text).slice(0, ANSWER_TEXT_MAX_CHARS).join(''), citations: unique };
}
