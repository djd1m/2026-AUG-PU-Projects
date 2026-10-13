import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { HttpError } from './boundaries.js';
import { transaction } from './db.js';

export const TTL_SECONDS = 7 * 24 * 60 * 60;
export const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
// Fixed-length prehash prevents bcrypt's 72-byte truncation for 128-character passwords.
export const passwordInput = password => createHash('sha256').update(password, 'utf8').digest('base64');
export const tokenHash = (token, secret) => createHmac('sha256', secret).update(token).digest('hex');
export function newSession(secret) {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: tokenHash(token, secret), expires: new Date(Date.now() + TTL_SECONDS * 1000) };
}
export function cookie(token, secure, clear = false) {
  return `roomkind_session=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : TTL_SECONDS}${secure ? '; Secure' : ''}`;
}
export function requestToken(req) {
  const match = /(?:^|;\s*)roomkind_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.headers.cookie ?? '');
  return match?.[1] ?? null;
}
export function createAuth(pool, secret, compare = bcrypt.compare) {
  return {
    async register(email, password) {
      const passwordHash = await bcrypt.hash(passwordInput(password), 10);
      const session = newSession(secret); const id = randomUUID();
      try {
        await transaction(pool, async client => {
          await client.query(`INSERT INTO account(id,email,password_hash,trial_granted) VALUES($1,$2,$3,true)`, [id, email, passwordHash]);
          await client.query(`INSERT INTO credit_ledger(id,account_id,delta,kind,reference) VALUES($1,$2,1,'trial',$2)`, [randomUUID(), id]);
          await client.query(`INSERT INTO session(token_hash,account_id,expires_at) VALUES($1,$2,$3)`, [session.hash, id, session.expires]);
        });
      } catch (error) { if (error.code === '23505') throw new HttpError(409, 'registration_unavailable'); throw error; }
      return session.token;
    },
    async login(email, password) {
      const { rows } = await pool.query('SELECT id,password_hash FROM account WHERE email=$1', [email]);
      const account = rows[0];
      const matches = await compare(passwordInput(password), account?.password_hash ?? DUMMY_HASH);
      if (!account || !matches) throw new HttpError(401, 'invalid_credentials');
      const session = newSession(secret);
      await pool.query('INSERT INTO session(token_hash,account_id,expires_at) VALUES($1,$2,$3)', [session.hash, account.id, session.expires]);
      return session.token;
    },
    async authenticate(req) {
      const token = requestToken(req);
      if (!token) throw new HttpError(401, 'authentication_required');
      const { rows } = await pool.query(`SELECT a.id,a.email,a.billing_hold,a.badge_free_entitlement,
        (SELECT COALESCE(sum(delta),0)::integer FROM credit_ledger WHERE account_id=a.id) AS credits
        FROM session s JOIN account a ON a.id=s.account_id
        WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`, [tokenHash(token, secret)]);
      if (!rows[0]) throw new HttpError(401, 'authentication_required');
      return rows[0];
    },
    async logout(req) {
      const token = requestToken(req);
      if (token) await pool.query('UPDATE session SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [tokenHash(token, secret)]);
    }
  };
}
