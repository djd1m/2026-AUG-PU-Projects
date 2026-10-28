import { cookies } from 'next/headers';
import { getRuntime } from '../runtime';
export interface SupportPageState {
  account: null | { id: string; email: string; verified: boolean };
  operator: boolean;
  mailAvailable: boolean;
  support: { mode: 'disabled'|'test'|'libredesk'; baseURL: string|null; inboxID: string|null;
    identifiedEnabled: boolean; contactEmail: string|null; synthetic: boolean };
}
export async function supportPageState(): Promise<SupportPageState> {
  const runtime = getRuntime();
  const { secret: _secret, ...support } = runtime.config.support;
  const result: SupportPageState = { account: null, operator: false, mailAvailable: runtime.config.mail.mode !== 'disabled', support };
  const token = (await cookies()).get('__Host-n5_session')?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return result;
  try {
    const row = (await runtime.pool.query<{id:string;email:string;verified:boolean;operator:boolean}>(`
      SELECT a.id,a.email,a.email_verified_at IS NOT NULL AS verified,
        EXISTS(SELECT 1 FROM support_operator o WHERE o.account_id=a.id AND o.revoked_at IS NULL) AS operator
      FROM account a JOIN session s ON s.account_id=a.id
      WHERE s.cookie_token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND a.status='active'`,
    [runtime.auth.tokenHash(token)])).rows[0];
    if (row) { result.account = { id: row.id, email: row.email, verified: row.verified }; result.operator = row.operator; }
  } catch { /* DB authority unavailable: never retain a staff claim. */ }
  return result;
}
