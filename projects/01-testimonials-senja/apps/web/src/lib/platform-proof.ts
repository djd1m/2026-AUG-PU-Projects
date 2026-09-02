// Отзыв, перенесённый владельцем с внешней площадки: разбор площадки и ссылки.
//
// Список хостов ЗАШИТ В КОД, а не вынесен в переменную окружения — по той же причине, что
// список подсетей платёжного провайдера: вынесенный наружу однажды приедет пустым, а пустой
// список хостов читается как «принимать любую ссылку».

export const PLATFORMS = {
  yandex_maps: { label: 'Яндекс.Карты', hosts: ['yandex.ru', 'yandex.by', 'yandex.kz', 'yandex.com'] },
  twogis: { label: '2ГИС', hosts: ['2gis.ru', '2gis.kz', '2gis.ae', '2gis.com'] },
  otzovik: { label: 'Отзовик', hosts: ['otzovik.com'] },
  flamp: { label: 'Флампе', hosts: ['flamp.ru'] },
  // «Другое» принимает любой https-хост, но и подпись даёт без названия площадки: обещать
  // читателю конкретный источник, которого мы не опознали, значит обещать лишнее.
  other: { label: 'другой источник', hosts: null as string[] | null },
} as const;

export type PlatformKey = keyof typeof PLATFORMS;

export function isPlatformKey(v: unknown): v is PlatformKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PLATFORMS, v);
}

export function platformLabel(key: string | null | undefined): string | null {
  return isPlatformKey(key) ? PLATFORMS[key].label : null;
}

/**
 * Разбор ссылки на первоисточник.
 *
 * Отказ ИМЕНУЕТ причину: «не ссылка», «нужен https» и «ссылка ведёт не на ту площадку» — разные
 * ошибки владельца, и общее «неверная ссылка» заставило бы его гадать, что именно исправлять.
 *
 * Поддомены разрешены (`maps.yandex.ru`), но только как СУФФИКС после точки: проверка
 * `endsWith('yandex.ru')` без точки пропустила бы `evilyandex.ru`.
 */
export function validateSourceUrl(
  platform: PlatformKey, raw: string,
): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { ok: false, error: 'source_url: это не ссылка' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'source_url: нужна ссылка https' };

  const hosts = PLATFORMS[platform].hosts;
  if (hosts === null) return { ok: true, url: u.toString() };

  const host = u.hostname.toLowerCase();
  const matches = hosts.some((h) => host === h || host.endsWith(`.${h}`));
  if (!matches) {
    return { ok: false, error: `source_url: ссылка ведёт не на ${PLATFORMS[platform].label} (${hosts.join(', ')})` };
  }
  return { ok: true, url: u.toString() };
}

/**
 * Доказательство обязано быть хотя бы одно.
 *
 * Отзыв «с площадки» без ссылки и без снимка — это просто текст, набранный владельцем. Пометка
 * источника на карточке обещает читателю проверяемость; обещание без обеспечения хуже отсутствия
 * пометки, потому что читатель ему верит. То же требование стоит ограничением в СУБД: код и схема
 * отказывают независимо друг от друга.
 */
export function hasProof(sourceUrl: string | null, hasScreenshot: boolean): boolean {
  return (sourceUrl !== null && sourceUrl !== '') || hasScreenshot;
}
