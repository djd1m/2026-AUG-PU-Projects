// Вход по бейджу и по демо-странице: `/?from=<домен хозяина>` (FR-GROWTH-003) и `/?from=b/<slug>` (FR-GROWTH-005).
// Значение приходит из адреса — это ввод постороннего: принимается только закрытая форма (домен в нижнем регистре,
// в т.ч. punycode, или `b/<slug>`), без нормализации. Мусор не показывается на лендинге и не пишется в cookie прихода.
// Та же форма — CHECK миграции 005 и ARRIVAL в packages/db/src/growth.ts. Модуль без зависимостей: его читает и
// middleware (edge), и серверный рендер лендинга.
export const ARRIVAL_COOKIE = '__Host-n6_from';
export const ARRIVAL_TTL_SECONDS = 7 * 24 * 60 * 60;
const FORM = /^(b\/[a-z0-9-]{3,60}|[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+)$/;

export function parseArrival(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 253) return null;
  return FORM.test(raw) ? raw : null;
}
// Демо-страница — `b/<slug>`, иначе — домен хозяина виджета.
export function arrivalSlug(from: string): string | null {
  return from.startsWith('b/') ? from.slice(2) : null;
}
export function readArrivalCookie(cookieHeader: string | null): string | null {
  const raw = cookieHeader?.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${ARRIVAL_COOKIE}=`))?.slice(ARRIVAL_COOKIE.length + 1);
  if (!raw) return null;
  try { return parseArrival(decodeURIComponent(raw)); } catch { return null; }
}
// Решение middleware лендинга: годный `from` в адресе — строка Set-Cookie, иначе ничего (прежний приход не затирается).
export function arrivalSetCookie(url: URL): string | null {
  const from = parseArrival(url.searchParams.get('from'));
  return from ? arrivalCookie(from) : null;
}
export function arrivalCookie(from: string): string {
  return `${ARRIVAL_COOKIE}=${encodeURIComponent(from)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ARRIVAL_TTL_SECONDS}`;
}
