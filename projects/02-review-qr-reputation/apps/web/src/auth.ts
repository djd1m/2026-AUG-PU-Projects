// Регистрация, вход, сессии владельца.
//
// В БД лежит ТОЛЬКО хеш токена: компрометация дампа не даёт захватить живые сессии.
// Пароль — scrypt из node:crypto: без внешней зависимости, параметры зашиты рядом с
// хешем, так что смена стоимости не ломает старые пароли.

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { pool, withAccount } from './db.js';

// promisify теряет перегрузку с опциями — типизируем руками.
function scrypt(pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((res, rej) =>
    scryptCb(pw, salt, keylen, opts, (e, key) => (e ? rej(e) : res(key))));
}
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
export const SESSION_COOKIE = 'rq_session';

const SCRYPT_N = 16384, SCRYPT_R = 8, SCRYPT_P = 1, KEYLEN = 32;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(plain, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  try {
    const [algo, nStr, saltB64, keyB64] = stored.split('$');
    if (algo !== 'scrypt' || !nStr || !saltB64 || !keyB64) return false;
    const key = await scrypt(plain, Buffer.from(saltB64, 'base64url'), KEYLEN,
      { N: Number(nStr), r: SCRYPT_R, p: SCRYPT_P });
    const expect = Buffer.from(keyB64, 'base64url');
    return key.length === expect.length && timingSafeEqual(key, expect);
  } catch {
    // Битый хеш в БД — «не совпало», а не 500.
    return false;
  }
}

/** Заглушечный хеш: verify считается ВСЕГДА, даже когда владельца нет, — иначе время
 *  ответа становится оракулом существования почты. Считается один раз, теми же
 *  параметрами, что боевые. */
let dummy: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(24).toString('base64url'));
  return dummy;
}

function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export interface Session { ownerId: string; accountId: string; }

export async function register(email: string, password: string, accountName: string):
  Promise<{ ok: true; token: string; accountId: string } | { ok: false; error: string }> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'почта выглядит неверно' };
  if (password.length < 8) return { ok: false, error: 'пароль от 8 символов' };
  if (password.length > 200) return { ok: false, error: 'пароль до 200 символов' };

  const hash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const owner = await client.query<{ id: string }>(
      `insert into owners (email, password_hash) values ($1, $2)
       on conflict (email) do nothing returning id`, [email, hash]);
    if (!owner.rows[0]) {
      await client.query('rollback');
      // ОДИН ответ на «занята» и на прочие отказы формы был бы лучше для перечисления,
      // но хуже для честной регистрации; здесь продукт для владельцев бизнеса, и
      // «почта занята — войдите» полезнее анти-оракула. Решение записано, а не случайно.
      return { ok: false, error: 'эта почта уже зарегистрирована — войдите' };
    }
    const acc = await client.query<{ id: string }>(
      `insert into accounts (name) values ($1) returning id`, [accountName || email]);
    await client.query(
      `insert into account_members (account_id, owner_id, role) values ($1, $2, 'admin')`,
      [acc.rows[0]!.id, owner.rows[0].id]);
    const token = randomBytes(32).toString('base64url');
    await client.query(
      `insert into sessions (owner_id, token_hash, expires_at) values ($1, $2, $3)`,
      [owner.rows[0].id, tokenHash(token), new Date(Date.now() + SESSION_TTL_MS)]);
    await client.query('commit');
    return { ok: true, token, accountId: acc.rows[0]!.id };
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function login(email: string, password: string):
  Promise<{ ok: true; token: string } | { ok: false }> {
  const { rows } = await pool.query<{ id: string; password_hash: string }>(
    'select id, password_hash from owners where email = $1', [email]);
  const owner = rows[0] ?? null;
  // verify считается ВСЕГДА — ранний возврат сделал бы ответ заметно быстрее и
  // превратил вход в оракул существования почты.
  const ok = await verifyPassword(owner?.password_hash ?? (await dummyHash()), password);
  if (!owner || !ok) return { ok: false };

  const token = randomBytes(32).toString('base64url');
  await pool.query(
    `insert into sessions (owner_id, token_hash, expires_at) values ($1, $2, $3)`,
    [owner.id, tokenHash(token), new Date(Date.now() + SESSION_TTL_MS)]);
  return { ok: true, token };
}

export async function resolveSession(token: string): Promise<Session | null> {
  if (!token) return null;
  const { rows } = await pool.query<{ owner_id: string; account_id: string }>(
    `select s.owner_id, am.account_id
       from sessions s
       join account_members am on am.owner_id = s.owner_id
      where s.token_hash = $1 and s.expires_at > now() and s.revoked_at is null
      limit 1`, [tokenHash(token)]);
  const r = rows[0];
  return r ? { ownerId: r.owner_id, accountId: r.account_id } : null;
}

export { withAccount };
