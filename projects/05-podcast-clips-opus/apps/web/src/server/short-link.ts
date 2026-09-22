import type { Pool } from '@clipmaker/db';
import { moscowDay } from '@clipmaker/shared/upload';
import { UploadError } from './upload-contract';

export interface ShortLink {
  id: string; code: string; account_id: string; title: string; status: string;
  thumbnail_key: string | null; expires_at: Date | null; finished_at: Date | null; plan: string;
}
const missing = () => new UploadError('not_found', 'Ссылка не найдена', 404);
const linkSelect = `SELECT l.id,l.code,v.account_id,c.title,c.status,c.thumbnail_key,c.expires_at,v.finished_at,a.plan
  FROM clip_link l JOIN clip c ON c.id=l.clip_id JOIN video v ON v.id=c.video_id
  JOIN account a ON a.id=v.account_id
  WHERE l.revoked_at IS NULL AND v.deleted_at IS NULL AND a.status='active'`;

export class ShortLinkService {
  constructor(private readonly pool: Pool, private readonly clock = () => new Date()) {}
  async find(code: string): Promise<ShortLink> {
    if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/.test(code)) throw missing();
    const row = (await this.pool.query<ShortLink>(`${linkSelect} AND l.code=$1`, [code])).rows[0];
    if (!row) throw missing();
    return row;
  }
  async recordView(link: ShortLink, account: string | null, prefix: string): Promise<void> {
    if (account === link.account_id) return;
    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      const inserted = await tx.query(`INSERT INTO growth_event (type, clip_link_id, ip_prefix, day)
        VALUES ('link_view',$1,$2::cidr,$3::date) ON CONFLICT DO NOTHING RETURNING id`,
      [link.id, prefix, moscowDay(this.clock())]);
      if (inserted.rowCount) await tx.query(`UPDATE clip_link SET unique_view_count=unique_view_count+1,
        last_view_at=$2 WHERE id=$1`, [link.id, this.clock()]);
      await tx.query('COMMIT');
    } catch (error) { await tx.query('ROLLBACK'); throw error; }
    finally { tx.release(); }
  }
  async copy(account: string, clip: string) {
    // One statement checks ownership and records the event for the pre-render code.
    const result = await this.pool.query<{ code: string }>(`WITH owned AS (
      SELECT l.id,l.code,c.id AS clip_id FROM clip_link l JOIN clip c ON c.id=l.clip_id
      JOIN video v ON v.id=c.video_id JOIN account a ON a.id=v.account_id
      WHERE c.id=$2 AND v.account_id=$1 AND a.status='active' AND v.deleted_at IS NULL AND l.revoked_at IS NULL
    ), recorded AS (
      INSERT INTO growth_event (type, account_id, clip_id, clip_link_id, day)
      SELECT 'link_copy',$1,clip_id,id,$3::date FROM owned RETURNING id
    ) SELECT code FROM owned WHERE EXISTS (SELECT 1 FROM recorded)`, [account, clip, moscowDay(this.clock())]);
    if (!result.rows[0]) throw missing();
    const code = result.rows[0].code;
    return { code, url: `/c/${code}` };
  }
}

export function previewState(link: ShortLink, now: Date): 'ready' | 'expired' | 'unavailable' {
  const expires = link.expires_at ?? (link.plan !== 'paid' && link.finished_at
    ? new Date(link.finished_at.getTime() + 3 * 86400_000) : null);
  if (expires && expires <= now) return 'expired';
  return link.status === 'done' && link.thumbnail_key ? 'ready' : 'unavailable';
}
