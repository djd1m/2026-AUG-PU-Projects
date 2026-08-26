// Сессии владельцев — Architecture §3.2.
//
// Инвариант: в БД лежит ТОЛЬКО хеш токена (`sessions.token_hash`), сам непрозрачный токен
// existует лишь в httpOnly-cookie у владельца. Компрометация дампа БД не даёт захватить
// активные сессии — это то, ради чего колонка называется token_hash, а не token.
//
// Хеш — HMAC-SHA256 на SESSION_SECRET (переменная уже объявлена у web в docker-compose.yml),
// а не «голый» sha256: без секрета украденный дамп нельзя перебрать заранее посчитанной
// радужной таблицей по 256-битным токенам.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'pw_session';

// [GAP из Architecture §3.2: «TTL сессии/политика ротации — реализовать разумный дефолт»].
// Взято 30 дней абсолютного TTL без скользящего продления: дашборд — не платёжный
// кабинет, а повторное перелогинивание раз в месяц не мешает работе. Ротация — вне MVP.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    // Fail-closed: молча сгенерировать секрет на старте нельзя — при нескольких репликах
    // web у каждой был бы свой, и сессии рассыпались бы непредсказуемо.
    throw new Error('SESSION_SECRET не задан (нужно >= 16 символов) — см. .env.example');
  }
  return secret;
}

/** Непрозрачный токен: 32 байта энтропии в base64url. В БД не попадает. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHmac('sha256', sessionSecret()).update(token).digest('hex');
}

/** Сравнение хешей константное по времени — на случай сравнения вне SQL. */
export function sessionTokenMatches(expectedHash: string, token: string): boolean {
  const actual = Buffer.from(hashSessionToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function sessionCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    // Secure выключается только вне production: на localhost по http браузер иначе
    // выбросит cookie и разработка встанет.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // 'strict' сломал бы возврат с внешнего платёжного провайдера (FR-008)
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}
