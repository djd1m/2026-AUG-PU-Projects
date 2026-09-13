// ClassifyContact (фича `pro-interest-and-limits-ui`, `02_pseudocode.md`,
// FR-pro-interest-and-limits-ui-6, AC-pro-interest-and-limits-ui-5).
//
// Контакт классифицируется ПО ФОРМЕ значения, а не по заявлению пользователя: значение,
// не подошедшее ни под один шаблон, отказывает («unrecognized»), а не выбирает более
// удобный вариант (`fail-closed-defaults`, CFG-I3). Чистая функция без побочных эффектов —
// сервер (`apps/api`) вызывает её как единственный источник истины; клиентская подсказка
// (`apps/web`) не обязана использовать ЭТУ же реализацию, но обязана вести себя мягче, не
// строже (FR-pro-interest-and-limits-ui-5).

import type { ProInterestContactKind } from './enums.js';

export type ClassifiedContact =
  | { readonly kind: ProInterestContactKind; readonly normalized: string }
  | { readonly kind: 'unrecognized' };

// Литералы дословно из `02_pseudocode.md` — локальная часть email непустая (≤ 64 символа),
// домен минимум с одной точкой; Telegram-логин 5-32 символа с необязательным ведущим `@`;
// числовой telegram_id — положительное целое разумной длины.
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const TELEGRAM_PATTERN = /^@?[A-Za-z0-9_]{5,32}$/;
const TELEGRAM_ID_PATTERN = /^[1-9][0-9]{4,15}$/;

/** Верхняя граница длины входа ДО классификации (AC-pro-interest-and-limits-ui-6). */
const MAX_CONTACT_LENGTH = 254;

export function classifyContact(raw: string): ClassifiedContact {
  const trimmed = raw.trim();
  // Пустая строка после обрезки — опечатка, а не «контакта нет намеренно» (шаг 1).
  if (trimmed === '') return { kind: 'unrecognized' };
  // Верхняя граница есть у ОБЕИХ форм; отсутствие общей границы само по себе дефект (шаг 2).
  if (trimmed.length > MAX_CONTACT_LENGTH) return { kind: 'unrecognized' };

  if (EMAIL_PATTERN.test(trimmed)) return { kind: 'email', normalized: trimmed.toLowerCase() };
  if (TELEGRAM_PATTERN.test(trimmed) || TELEGRAM_ID_PATTERN.test(trimmed)) {
    return { kind: 'telegram', normalized: trimmed };
  }
  // Форма, не подошедшая ни под один шаблон, НЕ угадывается (шаг 5).
  return { kind: 'unrecognized' };
}
