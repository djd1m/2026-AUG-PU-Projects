// Слаг проекта — Pseudocode §9, AC FR-001 «Слаг уникален, ^[a-z0-9-]{3,40}$».
//
// Схема НЕ навешивает CHECK на projects.slug (003_core.sql:33 — «валидация в коде»),
// поэтому этот модуль — единственное место, где живёт формат слага.

import { randomBytes } from 'node:crypto';

export const SLUG_PATTERN = /^[a-z0-9-]{3,40}$/;
export const SLUG_MAX = 40;
export const SLUG_MIN = 3;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** Алфавит без гласных и похожих глифов: суффикс не должен случайно сложиться в слово. */
const ALPHABET = '23456789bcdfghjkmnpqrstvwxz';

export function randomAlphaNum(length: number): string {
  // randomBytes, а не Math.random: слаг попадает в публичный URL /w/<slug>.
  // Отбрасываем байты, не попавшие в кратный диапазон — иначе смещение к началу алфавита.
  const out: string[] = [];
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < limit) {
        out.push(ALPHABET[byte % ALPHABET.length]);
        if (out.length === length) break;
      }
    }
  }
  return out.join('');
}

/**
 * Детерминированная часть нормализации: только приведение того, что пользователь уже написал.
 * Ничего не выдумывает — из "ab" получится "ab", а не "ab-x7q".
 */
export function normalizeSlugDeterministic(raw: string | null | undefined): string {
  let slug = (raw ?? '').toLowerCase();
  slug = slug.replace(/[^a-z0-9-]/g, '-'); // пробелы/спецсимволы/кириллица → дефис
  slug = slug.replace(/-{2,}/g, '-'); // схлопнуть повторы
  slug = slug.replace(/^-+|-+$/g, ''); // обрезать по краям
  slug = slug.slice(0, SLUG_MAX);
  // Обрезка по 40 могла обнажить дефис на конце ("...-") — убираем повторно.
  return slug.replace(/-+$/g, '');
}

/**
 * Pseudocode §9 normalizeSlug: детерминированная нормализация ПЛЮС добор случайным
 * суффиксом до минимальной длины.
 *
 * РАСХОЖДЕНИЕ С Pseudocode §9 (разрешено в пользу заявленного намерения). Псевдокод
 * применяет эту функцию и к явно введённому слагу, а затем проверяет результат на
 * SLUG_PATTERN. Но добор суффиксом делает эту проверку недостижимой для слишком короткого
 * ввода: "ab" превращается в валидный "ab-x7q" и молча уезжает в БД. Это ровно то, что
 * тот же §9 запрещает словами «Пользователь ЯВНО ввёл слаг — не подменяем его молча
 * случайным вариантом», и что «Граничные случаи» требуют отдать как 400.
 *
 * Поэтому добор суффиксом оставлен ТОЛЬКО для выведенного из названия слага (там выбора
 * пользователя нет и подменять нечего), а явный слаг проверяется после
 * normalizeSlugDeterministic — см. register.ts.
 */
export function normalizeSlug(raw: string | null | undefined): string {
  const slug = normalizeSlugDeterministic(raw);
  if (slug.length < SLUG_MIN) {
    // "ab" -> "ab-x7q". Гарантирует минимум 3 символа даже из пустой строки.
    const suffix = randomAlphaNum(3);
    return (slug.length === 0 ? suffix : `${slug}-${suffix}`).slice(0, SLUG_MAX);
  }
  return slug;
}

/**
 * Pseudocode §9 ensureUniqueSlug: доподбор свободного слага.
 * Применяется ТОЛЬКО к выведенному из названия слагу — явно введённый пользователем
 * слаг при занятости отдаёт 409, а не подменяется молча (Pseudocode §9, «Граничные случаи»).
 */
export async function ensureUniqueSlug(
  candidate: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  let slug = candidate;
  let attempt = 0;
  while (await exists(slug)) {
    attempt += 1;
    if (attempt > 10) {
      throw new Error('не удалось подобрать уникальный слаг за 10 попыток');
    }
    const suffix = `-${randomAlphaNum(4)}`;
    slug = candidate.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, '') + suffix;
  }
  return slug;
}
