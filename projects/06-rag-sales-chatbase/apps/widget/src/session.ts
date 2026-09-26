// Идентификатор сессии посетителя (Pseudocode «visitor_session»: «id живёт в sessionStorage виджета»). Написано
// заново (у донора N1 сессии посетителя нет — виджет отзывов ничего не спрашивал; ADR-016).
//
// UUID v4 из crypto.getRandomValues, а не randomUUID: последний есть только в «безопасном контексте», а сайт
// хозяина бывает и по http://. sessionStorage может бросать (запрет хранилища, песочница) — тогда id живёт в
// памяти страницы; это лишь снижает точность дедупликации показов, не ломает виджет. Сервер НЕ доверяет id
// вслепую: сессия привязывается к боту и origin при первой записи, чужая — 400 (packages/db/src/widget.ts).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function randomUuid(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function visitorSession(bot: string): string {
  const key = `n6-vs:${bot}`;
  try {
    const stored = sessionStorage.getItem(key);
    if (stored && UUID.test(stored)) return stored;
    const id = randomUuid();
    sessionStorage.setItem(key, id);
    return id;
  } catch { return randomUuid(); }
}
