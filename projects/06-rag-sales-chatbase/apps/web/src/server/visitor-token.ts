// Токен сессии посетителя виджета (фича visitor-ask-and-limits; model-call-cost «что такое один пользователь для
// того, кто не вошёл»). Написано заново (ADR-016).
//
// Зачем: cookie третьей стороны на чужом сайте может не работать (Safari ITP, запрет в браузере), а id, который виджет
// придумывает сам, — ключ квоты visitor_answers, выбранный КЛИЕНТОМ: подбором id посетитель обнулял бы свой предел.
// Поэтому id выдаёт СЕРВЕР в ответе GET /w/v1/config вместе с подписью HMAC-SHA256 по (id, бот, origin, префикс /24):
//   <uuid v4>.<43 символа base64url>
// Виджет хранит токен в sessionStorage и шлёт в /w/v1/event и /w/v1/ask. «Один посетитель» = id токена + его /24:
// токен с другого префикса, для другого бота или origin не проходит проверку — виджет получает новый через config.
// Сессия в БД создаётся лениво, при первом событии или вопросе (config ничего не пишет на каждый показ страницы).
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export interface VisitorBinding { botId: string; origin: string; ipPrefix: string }
const TOKEN = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;

function sign(secret: string, id: string, b: VisitorBinding): string {
  if (!secret) throw new Error('Секрет подписи сессии посетителя не задан: токен не выдаётся');
  return createHmac('sha256', secret).update(`n6-visitor-session\u0000${id}\u0000${b.botId}\u0000${b.origin}\u0000${b.ipPrefix}`).digest('base64url');
}

// id сессии из токена — только если подпись сходится для ЭТОЙ привязки; иначе null (чужой, подделанный, устаревший).
export function readVisitorToken(secret: string, token: unknown, binding: VisitorBinding): string | null {
  if (typeof token !== 'string') return null;
  const match = TOKEN.exec(token);
  if (!match) return null;
  const expected = Buffer.from(sign(secret, match[1]!, binding));
  const given = Buffer.from(match[2]!);
  return expected.length === given.length && timingSafeEqual(expected, given) ? match[1]! : null;
}

// Прежний токен виджета (из sessionStorage) продолжает сессию, если он годен для этой привязки; иначе — новый.
export function issueVisitorToken(secret: string, binding: VisitorBinding, previous?: string | null): string {
  if (previous && readVisitorToken(secret, previous, binding)) return previous;
  const id = randomUUID();
  return `${id}.${sign(secret, id, binding)}`;
}
