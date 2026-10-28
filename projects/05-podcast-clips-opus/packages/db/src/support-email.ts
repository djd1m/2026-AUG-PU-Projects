import { createHash, randomBytes } from 'node:crypto';
import type { SupportEmailPurpose, SupportEmailDeliveryState } from '@clipmaker/shared/enums';
import { transaction, type Pool, type PoolClient } from './index.js';
export type MailPurpose = SupportEmailPurpose;
export const emailDigest = (token: string) => createHash('sha256').update(token).digest('hex');
export interface EmailAuthority { accountId: string; sessionHash: string }
export class SupportEmailStore {
  constructor(private readonly pool: Pool) {}
  private async account(tx: PoolClient, id: string) {
    return (await tx.query<{id:string;email:string;status:string}>('SELECT id,email,status FROM account WHERE id=$1 FOR NO KEY UPDATE',[id])).rows[0];
  }
  private async sessions(tx: PoolClient, account: string, hashes: string[]) {
    const rows = (await tx.query<{cookie_token_hash:string}>(`SELECT cookie_token_hash FROM session WHERE account_id=$1
      AND cookie_token_hash=ANY($2::text[]) ORDER BY cookie_token_hash FOR UPDATE`,[account,[...new Set(hashes)].sort()])).rows;
    if (rows.length !== new Set(hashes).size) return false;
    return (await tx.query(`SELECT 1 FROM session WHERE account_id=$1 AND cookie_token_hash=ANY($2::text[])
      AND (revoked_at IS NOT NULL OR expires_at<=clock_timestamp())`,[account,hashes])).rowCount === 0;
  }
  async currentEmail(accountId:string) {
    return (await this.pool.query<{email:string}>("SELECT email FROM account WHERE id=$1 AND status='active'",[accountId])).rows[0]?.email??null;
  }
  async issue(purpose: MailPurpose, email: string, ipHash: string, emailHash: string, authority?: EmailAuthority) {
    // Cleanup commits before taking an account lock: reset/erase lock account before tokens.
    await transaction(this.pool,async tx => {
      await tx.query(`DELETE FROM support_email_token WHERE id IN (SELECT id FROM support_email_token
        WHERE COALESCE(used_at,expires_at)<clock_timestamp()-interval '7 days' ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED)`);
    });
    return transaction(this.pool,async tx => {
      // Stable locks include the shared IP and capacity key; no network or bcrypt while locked.
      for (const key of ['support:capacity',`support:ip:${ipHash}`,`support:email:${purpose}:${emailHash}`,`support:pair:${purpose}:${emailHash}:${ipHash}`].sort())
        await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
      await tx.query(`DELETE FROM support_mail_admission WHERE id IN (SELECT id FROM support_mail_admission
        WHERE created_at<clock_timestamp()-interval '1 hour' ORDER BY created_at LIMIT 100)`);
      const capacity = (await tx.query<{full:boolean}>(`SELECT (SELECT count(*) FROM support_mail_admission)>=10000
        OR (SELECT count(*) FROM support_email_token)>=10000 AS full`)).rows[0];
      if (!capacity || capacity.full) return null;
      const counts=(await tx.query<{email_count:string;ip_count:string;pair_count:string;cooldown:boolean}>(`SELECT
        count(*) FILTER(WHERE purpose=$1 AND email_hash=$2) AS email_count,
        count(*) FILTER(WHERE ip_hash=$3) AS ip_count,
        count(*) FILTER(WHERE purpose=$1 AND email_hash=$2 AND ip_hash=$3) AS pair_count,
        COALESCE(bool_or(purpose=$1 AND email_hash=$2 AND created_at>clock_timestamp()-interval '60 seconds'),false) AS cooldown
        FROM support_mail_admission WHERE created_at>clock_timestamp()-interval '1 hour'`,[purpose,emailHash,ipHash])).rows[0];
      if (!counts || +counts.email_count>=5 || +counts.ip_count>=30 || +counts.pair_count>=5 || counts.cooldown) return null;
      await tx.query('INSERT INTO support_mail_admission(purpose,email_hash,ip_hash) VALUES($1,$2,$3)',[purpose,emailHash,ipHash]);
      const candidate = authority ? {id:authority.accountId} : (await tx.query<{id:string}>('SELECT id FROM account WHERE email=$1',[email])).rows[0];
      if (!candidate) return null;
      const account=await this.account(tx,candidate.id);
      if (!account || account.status!=='active' || account.email!==email) return null;
      if (purpose==='verify' && (!authority || !await this.sessions(tx,account.id,[authority.sessionHash]))) return null;
      await tx.query('UPDATE support_email_token SET used_at=clock_timestamp() WHERE account_id=$1 AND purpose=$2 AND used_at IS NULL',[account.id,purpose]);
      const token=randomBytes(32).toString('base64url');
      const row=(await tx.query<{id:string}>(`INSERT INTO support_email_token(account_id,purpose,email,digest,issuing_session_hash,expires_at)
        VALUES($1,$2,$3,$4,$5,clock_timestamp()+CASE WHEN $2='verify' THEN interval '24 hours' ELSE interval '1 hour' END) RETURNING id`,
      [account.id,purpose,account.email,emailDigest(token),authority?.sessionHash??null])).rows[0];
      if (!row) throw new Error('token_insert_failed');
      return {id:row.id,token,email:account.email};
    });
  }
  async peek(token: string, purpose: MailPurpose) {
    return (await this.pool.query<{account_id:string;issuing_session_hash:string|null}>(`SELECT account_id,issuing_session_hash FROM support_email_token
      WHERE digest=$1 AND purpose=$2 AND used_at IS NULL AND expires_at>clock_timestamp()`,[emailDigest(token),purpose])).rows[0]??null;
  }
  async confirm(token: string, authority: EmailAuthority) {
    const hint=await this.peek(token,'verify');
    if (!hint || hint.account_id!==authority.accountId || !hint.issuing_session_hash) return false;
    return transaction(this.pool,async tx => {
      const account=await this.account(tx,hint.account_id);
      const hashes=[...new Set([hint.issuing_session_hash!,authority.sessionHash])];
      if (!account || account.status!=='active' || !await this.sessions(tx,account.id,hashes)) return false;
      await tx.query('SELECT id FROM support_email_token WHERE digest=$1 FOR UPDATE',[emailDigest(token)]);
      // Session rows are already locked; token-lock waiting can still cross their expiry.
      const active=await tx.query(`SELECT 1 FROM session WHERE account_id=$1 AND cookie_token_hash=ANY($2::text[])
        AND revoked_at IS NULL AND expires_at>clock_timestamp()`,[account.id,hashes]);
      if (active.rowCount!==hashes.length) return false;
      const used=await tx.query(`UPDATE support_email_token SET used_at=clock_timestamp() WHERE digest=$1 AND purpose='verify'
        AND account_id=$2 AND email=$3 AND used_at IS NULL AND expires_at>clock_timestamp() RETURNING id`,[emailDigest(token),account.id,account.email]);
      if (used.rowCount!==1) return false;
      await tx.query('UPDATE account SET email_verified_at=clock_timestamp() WHERE id=$1',[account.id]);
      return true;
    });
  }
  async reset(token: string, passwordHash: string) {
    const hint=await this.peek(token,'reset');
    if (!hint) return false;
    return transaction(this.pool,async tx => {
      const account=await this.account(tx,hint.account_id);
      if (!account || account.status!=='active') return false;
      await tx.query('SELECT id FROM session WHERE account_id=$1 ORDER BY cookie_token_hash FOR UPDATE',[account.id]);
      await tx.query('SELECT id FROM support_email_token WHERE account_id=$1 ORDER BY id FOR UPDATE',[account.id]);
      const used=await tx.query(`UPDATE support_email_token SET used_at=clock_timestamp() WHERE digest=$1 AND purpose='reset'
        AND account_id=$2 AND email=$3 AND used_at IS NULL AND expires_at>clock_timestamp() RETURNING id`,[emailDigest(token),account.id,account.email]);
      if (used.rowCount!==1) return false;
      await tx.query('UPDATE account SET password_hash=$2,updated_at=clock_timestamp() WHERE id=$1',[account.id,passwordHash]);
      await tx.query('UPDATE session SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE account_id=$1',[account.id]);
      await tx.query('UPDATE support_email_token SET used_at=COALESCE(used_at,clock_timestamp()) WHERE account_id=$1',[account.id]);
      return true;
    });
  }
  async delivery(id: string, state: Exclude<SupportEmailDeliveryState,'pending'>) {
    await this.pool.query('UPDATE support_email_token SET delivery_state=$2 WHERE id=$1',[id,state]);
  }
}
