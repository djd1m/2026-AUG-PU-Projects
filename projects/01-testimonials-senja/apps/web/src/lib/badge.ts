// FR-GROWTH-003 — badge loop. Источник: Specification FR-GROWTH-003, ADR-002,
// Architecture §6 (таблица событий).
//
// Зачем этот файл существует: badge — единственное звено, которым продукт попадает
// к людям, не знающим о нём. Виджет стоит на чужом сайте, посетитель видит
// «Powered by Proofwall», кликает и попадает на регистрацию. Если ссылки нет или
// в ней нет меток источника — петля разомкнута: приход будет, а знания, откуда он,
// не будет, и growth-канал нечем измерить.

export const UTM_SOURCE = 'widget_badge';
export const UTM_MEDIUM = 'referral';

/**
 * Адрес, куда ведёт badge. Строится на СЕРВЕРЕ и отдаётся виджету готовым:
 * виджет живёт на чужом домене и не может знать наш публичный адрес — «догадаться»
 * он мог бы только из origin API-запроса, а тот однажды разъедется со статикой (ADR-007).
 *
 * utm_campaign — слаг проекта, чей виджет привёл посетителя. Это не аналитическая
 * роскошь: без него нельзя ни начислить партнёру, ни ответить владельцу на вопрос
 * «сколько людей пришло с моего сайта».
 */
export function buildBadgeUrl(baseUrl: string, projectSlug: string, domain?: string | null): string {
  const url = new URL('/', baseUrl);
  url.searchParams.set('utm_source', UTM_SOURCE);
  url.searchParams.set('utm_medium', UTM_MEDIUM);
  url.searchParams.set('utm_campaign', projectSlug);
  // Домен-носитель: тот же виджет одного проекта может стоять на нескольких сайтах,
  // и «откуда именно пришли» — разные ответы.
  if (domain) url.searchParams.set('utm_content', domain);
  return url.toString();
}

export interface BadgeAttribution {
  source: string;
  campaign: string | null;
  content: string | null;
}

/**
 * Разбор меток на входе — используется при регистрации для события signup_from_badge
 * (Architecture §6). Принимает как строку запроса, так и готовый URLSearchParams.
 *
 * Возвращает null для любого источника, кроме нашего badge: считать «пришёл по бейджу»
 * посетителя с чужой utm-меткой значило бы завышать эффект growth-канала.
 */
export function parseBadgeAttribution(query: URLSearchParams | string | null | undefined): BadgeAttribution | null {
  if (!query) return null;
  const params = typeof query === 'string' ? new URLSearchParams(query.replace(/^\?/, '')) : query;
  if (params.get('utm_source') !== UTM_SOURCE) return null;
  return {
    source: UTM_SOURCE,
    campaign: params.get('utm_campaign'),
    content: params.get('utm_content'),
  };
}
