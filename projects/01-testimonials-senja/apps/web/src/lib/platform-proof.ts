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
  other: { label: 'Другой источник', from: 'внешней площадки', hosts: null as string[] | null },
} as const;

/**
 * Подпись в РОДИТЕЛЬНОМ падеже — для фразы «Отзыв с …».
 *
 * Названия площадок в неё подставляются как есть: «Отзыв с Яндекс.Карты» читается нормально,
 * склонять чужой бренд мы не вправе. А вот нарицательное «другой источник» в той же позиции
 * давало «Отзыв с другой источник» — и это увидел бы каждый читатель стены. Отдельное поле
 * вместо склеивания: падеж — свойство слова, а не строки формата.
 */
export function platformFrom(key: string | null | undefined): string | null {
  if (!isPlatformKey(key)) return null;
  const def = PLATFORMS[key] as { label: string; from?: string };
  return def.from ?? def.label;
}

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

/**
 * Площадка ИЗ АДРЕСА, без обращения в сеть.
 *
 * Ключ площадки лежит в самом хосте ссылки — спрашивать его у владельца отдельно значит
 * заставлять человека сообщать то, что уже написано в том, что он вставил. Сеть при этом не
 * нужна: разбор адреса — чистая функция, и она не упирается ни в капчу, ни в антибот, о
 * которые разбивается всякая попытка ПРОЧИТАТЬ страницу отзыва.
 *
 * Неопознанный хост — не отказ, а `other`: ссылка остаётся доказательством, просто подпись на
 * карточке будет без названия площадки. Отказывать здесь значило бы терять отзыв из-за того,
 * что мы не узнали сайт.
 */
export function detectPlatform(raw: string): PlatformKey | null {
  let host: string;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:') return null;
    host = u.hostname.toLowerCase();
  } catch { return null; }

  for (const [key, def] of Object.entries(PLATFORMS)) {
    const hosts = def.hosts;
    if (hosts === null) continue;
    if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return key as PlatformKey;
  }
  return 'other';
}
