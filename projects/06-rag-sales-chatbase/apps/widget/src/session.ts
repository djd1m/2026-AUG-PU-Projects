// Токен сессии посетителя (фича visitor-ask-and-limits; Pseudocode «visitor_session»: «id живёт в sessionStorage виджета»).
// Написано заново (у донора N1 сессии посетителя нет; ADR-016).
//
// Токен ВЫДАЁТ СЕРВЕР в ответе GET /w/v1/config (id + подпись по боту, origin и префиксу /24 — apps/web/src/server/
// visitor-token.ts): id, придуманный виджетом, был бы ключом квоты, выбранным клиентом. Cookie третьей стороны на чужом
// сайте может не работать, поэтому токен хранится в sessionStorage и уходит в config (?vs=) — сервер продолжает прежнюю
// сессию, если токен годен, иначе выдаёт новый. sessionStorage может бросать (запрет хранилища, песочница) — тогда
// токен живёт в памяти страницы: виджет работает, сессия просто короче.

export const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/;
const key = (bot: string) => `n6-vs:${bot}`;

export function readSession(bot: string): string | null {
  try {
    const stored = sessionStorage.getItem(key(bot));
    return stored && TOKEN.test(stored) ? stored : null;
  } catch { return null; }
}

export function storeSession(bot: string, token: string): void {
  try { sessionStorage.setItem(key(bot), token); } catch { /* хранилище запрещено — токен живёт в памяти окна */ }
}
