// CheckOrigin (Pseudocode; FR-WIDGET-002, ADR-005) и заголовки CORS маршрутов /w/v1/*. Написано заново: у донора
// N1 CORS не было вовсе (виджет делал простой GET, домен брался из Referer), а двойной ACAO приложения и Caddy
// молча ломал N1 (deployment-seams) — здесь заголовок ставит ТОЛЬКО web, Caddy его не трогает (proxy/Caddyfile).
//
// Правила: origin — только из заголовка Origin (Referer не используется: браузер шлёт Origin на КАЖДЫЙ
// кросс-доменный fetch виджета, а Referer лишь добавил бы путь для небраузерных клиентов накручивать установки);
// отсутствует, `null`, не http(s), с путём — отказ. Сравнение — ТОЧНОЕ с нормализованной строкой списка бота
// (нижний регистр хоста, порт по умолчанию снят): поддомены и маски не допускаются. Свой origin (демо-страница) —
// только при public_enabled. Ответ — ровно origin хозяина, `Vary: Origin`, без Allow-Credentials; джокера `*` нет.
//
// Демо-страница /b/{slug} (фича public-page-and-summary): браузер НЕ шлёт Origin на GET к своему же origin, поэтому
// GET /w/v1/config с демо-страницы пришёл бы без него и получил 403. Если Origin отсутствует и браузер пометил запрос
// `Sec-Fetch-Site: same-origin` (заголовок, который скрипт страницы подделать не может), источником считается
// N6_PUBLIC_ORIGIN — дальше действует то же правило «свой origin только при public_enabled». Небраузерный клиент
// подделает этот заголовок ровно так же, как сам Origin, — защита не слабеет. Иные значения (`cross-site`, `none`,
// отсутствие) — отказ, как и раньше. Safari < 16.4 без Sec-Fetch-Site не получит чата на демо-странице (fail-closed).
export function requestOrigin(headers: Headers, publicOrigin?: string): string | null {
  const raw = headers.get('origin');
  if (!raw && publicOrigin && headers.get('sec-fetch-site') === 'same-origin') return new URL(publicOrigin).origin;
  if (!raw || raw === 'null') return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || raw.includes('/', url.protocol.length + 2)) return null;
  return url.origin;
}

export function checkOrigin(origin: string | null, bot: { origins: readonly string[]; publicEnabled: boolean }, publicOrigin: string): string | null {
  if (!origin) return null;
  if (origin === new URL(publicOrigin).origin) return bot.publicEnabled ? origin : null;
  return bot.origins.includes(origin) ? origin : null;
}

export function corsHeaders(origin: string): Record<string, string> {
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
}
export const PREFLIGHT_HEADERS = { 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' };
