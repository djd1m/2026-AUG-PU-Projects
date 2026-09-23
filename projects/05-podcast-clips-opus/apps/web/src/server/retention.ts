import { transaction, type Pool } from '@clipmaker/db';
export interface RetentionStorage { delete(key: string): Promise<void>; erasePrefix(prefix: string): Promise<void> }
export const RETENTION_INTERVAL_MS = 3600_000;
// One hour lets already-issued part URLs and bounded in-flight storage writes settle.
export const ERASURE_QUIET_MS = 3600_000;
export async function eraseAccount(pool: Pool, storage: RetentionStorage, account: string, now: Date) {
  const videos = await pool.query<{ id: string }>('SELECT id FROM video WHERE account_id=$1', [account]);
  await storage.erasePrefix(`videos/${account}/`);
  for (const video of videos.rows) {
    for (const prefix of ['clips/free', 'clips/paid', 'thumbs']) await storage.erasePrefix(`${prefix}/${video.id}/`);
  }
  await transaction(pool, async tx => {
    const locked = await tx.query("SELECT id FROM account WHERE id=$1 AND status='erasing' FOR UPDATE", [account]);
    if (!locked.rowCount) return;
    // Preserve aggregates, remove identifying links AND network prefixes, including guest events.
    await tx.query(`UPDATE growth_event SET account_id=NULL,video_id=NULL,clip_id=NULL,clip_link_id=NULL,
      guest_pack_id=NULL,partner_code_id=NULL,ip_prefix=NULL WHERE account_id=$1
      OR video_id IN (SELECT id FROM video WHERE account_id=$1)
      OR clip_id IN (SELECT c.id FROM clip c JOIN video v ON v.id=c.video_id WHERE v.account_id=$1)
      OR clip_link_id IN (SELECT l.id FROM clip_link l JOIN clip c ON c.id=l.clip_id JOIN video v ON v.id=c.video_id WHERE v.account_id=$1)
      OR guest_pack_id IN (SELECT id FROM guest_pack WHERE account_id=$1)
      OR partner_code_id IN (SELECT pc.id FROM partner_code pc JOIN partner p ON p.id=pc.partner_id WHERE p.account_id=$1)`, [account]);
    await tx.query('DELETE FROM guest_pack_clip WHERE guest_pack_id IN (SELECT id FROM guest_pack WHERE account_id=$1)', [account]);
    await tx.query('DELETE FROM guest_pack WHERE account_id=$1', [account]);
    await tx.query('DELETE FROM job_attempt WHERE video_id IN (SELECT id FROM video WHERE account_id=$1)', [account]);
    await tx.query('DELETE FROM clip_link WHERE clip_id IN (SELECT c.id FROM clip c JOIN video v ON v.id=c.video_id WHERE v.account_id=$1)', [account]);
    await tx.query('DELETE FROM clip WHERE video_id IN (SELECT id FROM video WHERE account_id=$1)', [account]);
    await tx.query('DELETE FROM transcript WHERE video_id IN (SELECT id FROM video WHERE account_id=$1)', [account]);
    await tx.query('DELETE FROM video WHERE account_id=$1', [account]);
    for (const table of ['session', 'pro_interest']) await tx.query(`DELETE FROM ${table} WHERE account_id=$1`, [account]);
    await tx.query(`DELETE FROM attribution WHERE account_id=$1 OR partner_code_id IN
      (SELECT pc.id FROM partner_code pc JOIN partner p ON p.id=pc.partner_id WHERE p.account_id=$1)`, [account]);
    await tx.query('DELETE FROM partner_code WHERE partner_id IN (SELECT id FROM partner WHERE account_id=$1)', [account]);
    await tx.query('DELETE FROM partner WHERE account_id=$1', [account]);
    await tx.query("DELETE FROM quota_counter WHERE scope_key=$1 AND scope LIKE 'user_%'", [account]);
    await tx.query(`UPDATE account SET status='deleted',email='deleted:'||id::text,password_hash='',telegram_user_id=NULL,updated_at=$2 WHERE id=$1`, [account, now]);
  });
}
export async function retentionTick(pool: Pool, storage: RetentionStorage, now = new Date(), batch = 100) {
  // Session-level lock spans S3, without an open SQL transaction. All web replicas share it.
  const lease = await pool.connect();
  try {
    if (!(await lease.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(50921012) AS locked')).rows[0]?.locked) return;
    let backlog = false;
    for (let page = 0; page < 100; page++) {
    const expired = await pool.query(`UPDATE guest_pack SET revoked_at=$1 WHERE id IN
      (SELECT id FROM guest_pack WHERE revoked_at IS NULL AND expires_at<=$1 ORDER BY expires_at LIMIT $2)`, [now, batch]);
      if ((expired.rowCount ?? 0) < batch) break;
      if (page === 99) backlog = true;
    }
    for (let page = 0; page < 100; page++) {
    const refused = await pool.query(`DELETE FROM video WHERE id IN (SELECT id FROM video
      WHERE status='failed' AND failure_reason='refused_user_uploads' AND created_at<=$1 ORDER BY created_at LIMIT $2)`,
    [new Date(now.getTime() - 24 * 3600_000), batch]);
      if ((refused.rowCount ?? 0) < batch) break;
      if (page === 99) backlog = true;
    }
    const clips = await pool.query<{ id: string; object_key: string | null; thumbnail_key: string | null }>(`SELECT c.id,c.object_key,c.thumbnail_key FROM clip c
      JOIN video v ON v.id=c.video_id JOIN account a ON a.id=v.account_id
      WHERE c.status='done' AND a.status='active' AND a.plan <> 'paid' AND v.status IN ('done','failed')
      AND v.finished_at <= $1 AND (c.object_key IS NOT NULL OR c.thumbnail_key IS NOT NULL)
      ORDER BY v.finished_at LIMIT $2`, [new Date(now.getTime() - 3 * 86400_000), batch]);
    let errors = 0;
    for (const clip of clips.rows) {
      try {
        for (const key of [clip.object_key, clip.thumbnail_key]) if (key) await storage.delete(key);
        await pool.query('UPDATE clip SET object_key=NULL,thumbnail_key=NULL,expires_at=COALESCE(expires_at,$2) WHERE id=$1', [clip.id, now]);
      } catch (error) { console.error('Очистка: удаление клипа не завершено; повтор на следующем проходе', error); errors++; }
    }
    const accounts = await pool.query<{ id: string }>(`SELECT id FROM account WHERE status='erasing' AND deletion_requested_at <= $1
      ORDER BY updated_at,id LIMIT $2`, [new Date(now.getTime() - ERASURE_QUIET_MS), batch]);
    for (const account of accounts.rows) {
      try { await eraseAccount(pool, storage, account.id, now); }
      catch (error) {
        console.error('Очистка: стирание аккаунта не завершено; повтор на следующем проходе', error);
        errors++; await pool.query('UPDATE account SET updated_at=$2 WHERE id=$1', [account.id, now]);
      }
    }
    if (errors) throw new Error(`Очистка: не завершено операций ${errors}; повтор на следующем проходе`);
    return { backlog: backlog || clips.rows.length === batch || accounts.rows.length === batch };
  } finally {
    try { await lease.query('SELECT pg_advisory_unlock(50921012)'); } finally { lease.release(); }
  }
}
