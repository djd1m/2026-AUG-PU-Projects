import {
  hashPassword, verifyPassword, issueTokens, verifyAccessToken, TokenConfig,
} from '@grelka/core';
import { planLimits, Plan, PLANS } from '@grelka/shared';
import type { Config } from './config.ts';

export type Db = Config['db'];

export interface UserRow {
  id: string;
  email: string;
  role: string;
  email_confirmed_at: string | null;
}

export async function insertUser(db: Db, email: string, password: string, nowMs: number): Promise<UserRow> {
  const existing = await db.one<UserRow>('SELECT id, email, role, email_confirmed_at FROM users WHERE email = $1', [email]);
  if (existing) throw Object.assign(new Error('email занят'), { code: 400 });
  const id = crypto.randomUUID();
  const rec = await hashPassword(password);
  await db.exec(
    'INSERT INTO users (id, email, password_record, role) VALUES ($1,$2,$3,$4)',
    [id, email, rec, 'owner'],
  );
  await writeAudit(db, id, 'signup', `user=${email}`, nowMs);
  return { id, email, role: 'owner', email_confirmed_at: null };
}

export async function confirmEmail(db: Db, email: string, nowMs: number): Promise<void> {
  await db.exec('UPDATE users SET email_confirmed_at = now() WHERE email = $1', [email]);
  const u = await db.one<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  if (u) await writeAudit(db, u.id, 'confirm_email', `user=${email}`, nowMs);
}

export async function loginUser(db: Db, email: string, password: string): Promise<UserRow> {
  const u = await db.one<UserRow & { password_record: string }>(
    'SELECT id, email, role, email_confirmed_at, password_record FROM users WHERE email = $1', [email]);
  if (!u) throw Object.assign(new Error('неверные данные'), { code: 401 });
  const ok = await verifyPassword(password, u.password_record);
  if (!ok) {
    const n = await db.one<{ n: string }>(
      'SELECT count(*)::text AS n FROM audit_log WHERE action = $1 AND subject LIKE $2 AND ts > now() - interval \'15 minutes\'',
      ['login_fail', `user=${email}%`],
    );
    if (Number(n?.n ?? '0') >= 5) throw Object.assign(new Error('слишком много попыток: подождите 15 минут'), { code: 429 });
    await writeAudit(db, u.id, 'login_fail', `user=${email}`, Date.now());
    throw Object.assign(new Error('неверные данные'), { code: 401 });
  }
  await writeAudit(db, u.id, 'login', `user=${email}`, Date.now());
  return u;
}

export async function persistRefreshSession(db: Db, userId: string, refresh: string, ttlSec: number, nowMs: number): Promise<void> {
  const h = await hashPassword(refresh, '00'.repeat(16));
  await db.exec('INSERT INTO sessions (id, user_id, refresh_hash, expires_at) VALUES ($1,$2,$3,$4)', [
    crypto.randomUUID(), userId, h, new Date(nowMs + ttlSec * 1000),
  ]);
}

export async function revokeSession(db: Db, userId: string, refresh: string): Promise<void> {
  const h = await hashPassword(refresh, '00'.repeat(16));
  await db.exec('DELETE FROM sessions WHERE user_id = $1 AND refresh_hash = $2', [userId, h]);
}

export async function authUserId(cfg: Config, bearer: string | undefined): Promise<string> {
  if (!bearer?.startsWith('Bearer ')) throw Object.assign(new Error('нет токена'), { code: 401 });
  const sub = verifyAccessToken(bearer.slice(7), tokenConfig(cfg), Date.now());
  if (!sub) throw Object.assign(new Error('токен недействителен'), { code: 401 });
  return sub;
}

export function tokenConfig(cfg: Config): TokenConfig {
  return { accessTtlSec: cfg.accessTtlSec, refreshTtlSec: cfg.refreshTtlSec, secret: cfg.tokenSecret };
}

export function issueForUser(cfg: Config, userId: string, nowMs: number): { access: string; refresh: string; expiresAt: number } {
  const t = issueTokens(userId, tokenConfig(cfg), nowMs);
  return { access: t.access, refresh: t.refresh, expiresAt: t.expiresAt };
}

export async function writeAudit(db: Db, userId: string | null, action: string, subject: string, nowMs: number, consentVersion?: string): Promise<void> {
  await db.exec('INSERT INTO audit_log (id, user_id, action, subject, consent_version, ts) VALUES ($1,$2,$3,$4,$5,$6)', [
    crypto.randomUUID(), userId, action, subject, consentVersion ?? null, new Date(nowMs),
  ]);
}

export async function userPlan(db: Db, userId: string): Promise<{ plan: Plan; status: string | null; currentUntil: number | null }> {
  const s = await db.one<{ plan: Plan; status: string; current_until: string }>(
    'SELECT plan, status, current_until FROM subscriptions WHERE user_id = $1', [userId]);
  if (!s) return { plan: 'free', status: null, currentUntil: null };
  return { plan: s.plan, status: s.status, currentUntil: s.current_until ? Date.parse(s.current_until) : null };
}

export async function planQuotaLeft(db: Db, userId: string, nowMs: number): Promise<{ plan: Plan; usedMailboxes: number; limitMailboxes: number | null; dailyPerMailbox: number }> {
  const { plan } = await userPlan(db, userId);
  const lim = planLimits(plan);
  const used = Number((await db.one<{ n: string }>(
    `SELECT count(*)::text AS n FROM mailboxes WHERE user_id = $1 AND status <> 'disabled'`, [userId]))?.n ?? '0');
  void nowMs;
  return { plan, usedMailboxes: used, limitMailboxes: lim.mailboxes, dailyPerMailbox: lim.dailyPerMailbox };
}

const RU_TLD_RE = /\.(ru|su|рф)$/i;

export function isRuAddress(a: string): boolean {
  return RU_TLD_RE.test(a) || /[а-яё]/i.test(a.split('@')[1] ?? '');
}
