import { hmacSign, safeEqual, uuid } from '@grelka/secrets';

export interface TokenConfig {
  accessTtlSec: number;
  refreshTtlSec: number;
  secret: Buffer;
}

export interface IssuedTokens {
  access: string;
  refresh: string;
  expiresAt: number;
  refreshExpiresAt: number;
}

const b64u = (b: Buffer) => b.toString('base64url');

export function issueTokens(userId: string, cfg: TokenConfig, nowMs: number): IssuedTokens {
  const nowSec = Math.floor(nowMs / 1000);
  const access = `${b64u(Buffer.from(JSON.stringify({ sub: userId, exp: nowSec + cfg.accessTtlSec })))}.${b64u(hmacSign(cfg.secret, `a:${userId}:${nowSec + cfg.accessTtlSec}`))}`;
  const refresh = `${b64u(Buffer.from(JSON.stringify({ sub: userId, exp: nowSec + cfg.refreshTtlSec, r: uuid() })))}.${b64u(hmacSign(cfg.secret, `r:${userId}:${nowSec + cfg.refreshTtlSec}`))}`;
  return { access, refresh, expiresAt: nowSec + cfg.accessTtlSec, refreshExpiresAt: nowSec + cfg.refreshTtlSec };
}

export function verifyAccessToken(token: string, cfg: TokenConfig, nowMs: number): string | null {
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  let payload: { sub?: string; exp?: number };
  try {
    payload = JSON.parse(Buffer.from(token.slice(0, dot), 'base64url').toString());
  } catch {
    return null;
  }
  if (!payload.sub || typeof payload.exp !== 'number') return null;
  const expected = b64u(hmacSign(cfg.secret, `a:${payload.sub}:${payload.exp}`));
  if (!safeEqual(token.slice(dot + 1), expected)) return null;
  if (payload.exp <= Math.floor(nowMs / 1000)) return null;
  return payload.sub;
}
