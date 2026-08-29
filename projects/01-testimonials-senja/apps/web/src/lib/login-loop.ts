// Обнаружение петли «кабинет → вход → кабинет → вход → …» (ревью FR-009, M-4).
//
// До входа отсутствие сессии вело на лендинг: тупик, но ВИДИМЫЙ. С появлением входа
// дашборд стал слать на /login?next=<кабинет>, а форма после успеха — обратно в кабинет.
// Если выданная cookie до сервера не доезжает, цикл замыкается и крутится бесконечно.
//
// Форма при этом ошибки не показывает: сервер ответил 200, с её точки зрения всё хорошо.
//
// Когда cookie не доезжает, хотя вход успешен:
//   1. APP_DOMAIN без TLS. Cookie помечена Secure (session.ts, NODE_ENV=production),
//      и браузер её ВЫБРАСЫВАЕТ, не сообщая никому.
//   2. Две реплики web с разными SESSION_SECRET: сессию выдала одна, проверяет другая,
//      хеш не сходится.
//   3. Расширение или политика браузера, режущая сторонние/третьи cookie.
//
// Признак петли: мы уже успешно вошли и просили ровно этот адрес — и снова оказались
// на форме входа. Один отскок и есть доказательство: при работающей сессии возврата
// на /login не происходит вовсе.

export const LOOP_MARKER_KEY = 'pw_login_return';
/** За пределами окна отметка считается посторонней: пользователь мог вернуться сам. */
export const LOOP_WINDOW_MS = 60_000;

export interface LoopMarker {
  target: string;
  ts: number;
}

export function makeLoopMarker(target: string, now: number): string {
  return JSON.stringify({ target, ts: now } satisfies LoopMarker);
}

/**
 * true — мы вернулись на форму после успешного входа за тем же адресом, то есть петля.
 *
 * Все сомнительные случаи трактуются как «не петля»: битая отметка, чужой адрес,
 * протухшее окно. Ложное «петля» напугало бы человека, у которого всё работает.
 */
export function isReturnLoop(rawMarker: unknown, requestedNext: string | null, now: number): boolean {
  if (typeof rawMarker !== 'string' || rawMarker === '') return false;
  let mark: unknown;
  try {
    mark = JSON.parse(rawMarker);
  } catch {
    return false;
  }
  if (typeof mark !== 'object' || mark === null) return false;
  const { target, ts } = mark as Partial<LoopMarker>;
  if (typeof target !== 'string' || typeof ts !== 'number' || !Number.isFinite(ts)) return false;
  if (now - ts < 0 || now - ts > LOOP_WINDOW_MS) return false;
  return target === requestedNext;
}
