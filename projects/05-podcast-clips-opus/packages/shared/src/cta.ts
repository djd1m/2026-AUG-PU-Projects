import { CTA_KIND, readCtaKind, type CtaKind } from './enums.js';
// Призыв к действию в конце клипа (ADR-017, FR-RESULT-006).
// Текст — только из этого закрытого словаря: свободный текст автора на нашем домене был бы
// поверхностью фишинга, а в 27b он же уйдёт в пиксели и в чужие ленты навсегда.
export const CTA_URL_MAX = 2048;
export const CTA_CHOICE_LABELS = {
  none: 'Без призыва', watch_full: 'Смотреть полный выпуск', subscribe: 'Подписаться', open_link: 'Перейти по ссылке',
} as const satisfies Record<CtaKind, string>;
export const CTA_BUTTON_LABELS = {
  watch_full: 'Смотреть полный выпуск →', subscribe: 'Подписаться →', open_link: 'Перейти по ссылке →',
} as const satisfies Record<Exclude<CtaKind, 'none'>, string>;
export const CTA_CHOICES = CTA_KIND.map(kind => ({ kind, label: CTA_CHOICE_LABELS[kind] }));

export class CtaError extends Error {
  constructor(message: string) { super(message); this.name = 'CtaError'; }
}
export type CtaTarget = { kind: 'none'; url: null } | { kind: Exclude<CtaKind, 'none'>; url: string };

/**
 * Разбор адреса призыва. Только https, без логина/пароля, без пробелов и управляющих символов,
 * не длиннее CTA_URL_MAX ни в исходном, ни в нормализованном виде. Непригодное — отказ, не молчаливое «none».
 * Сервер по адресу НЕ ходит: здесь только разбор строки в памяти (нет SSRF).
 */
export function parseCtaUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw === '') throw new CtaError('Укажите адрес ссылки для призыва');
  if (raw.length > CTA_URL_MAX) throw new CtaError(`Адрес длиннее ${CTA_URL_MAX} символов`);
  if (/[\s\x00-\x1f\x7f]/.test(raw)) throw new CtaError('Адрес не должен содержать пробелов');
  let url: URL;
  try { url = new URL(raw); } catch { throw new CtaError('Адрес не похож на ссылку. Пример: https://www.youtube.com/watch?v=…'); }
  if (url.protocol !== 'https:') throw new CtaError('Разрешены только ссылки https://');
  if (url.username || url.password) throw new CtaError('Адрес не должен содержать логин или пароль');
  if (!url.hostname) throw new CtaError('В адресе нет домена');
  if (url.href.length > CTA_URL_MAX) throw new CtaError(`Адрес длиннее ${CTA_URL_MAX} символов`);
  return url.href;
}

/** Вид + адрес из ввода пользователя: вид из закрытого набора; для none адреса быть не должно. */
export function parseCtaTarget(kind: unknown, url: unknown): CtaTarget {
  if (kind === undefined && (url === undefined || url === null)) return { kind: 'none', url: null };
  if (typeof kind !== 'string' || !(CTA_KIND as readonly string[]).includes(kind)) throw new CtaError('Неизвестный вид призыва');
  if (kind === 'none') {
    if (url !== undefined && url !== null) throw new CtaError('Для «Без призыва» адрес не указывается');
    return { kind: 'none', url: null };
  }
  return { kind: kind as Exclude<CtaKind, 'none'>, url: parseCtaUrl(url) };
}

/** Чтение из хранилища для показа: любое расхождение — самое строгое, то есть призыва нет. */
export function readStoredCta(kind: unknown, url: unknown): CtaTarget {
  const safeKind = readCtaKind(kind);
  if (safeKind === 'none') return { kind: 'none', url: null };
  try { return { kind: safeKind, url: parseCtaUrl(url) }; } catch { return { kind: 'none', url: null }; }
}

/** Видимое доменное имя назначения: зритель видит, куда уходит. IDN уже в punycode (new URL). */
export function ctaDisplayHost(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}
