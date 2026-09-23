import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Pool } from '@clipmaker/db';
import { moscowDay } from '@clipmaker/shared/upload';
import { GUEST_CONSENT_TEXT, GUEST_CONSENT_VERSION, type GuestPackSummary } from '../lib/guest-contract';
import { UploadError } from './upload-contract';
import { ensurePartnerCode } from './partner-code';
import { presentClip, type ClipRow } from './screen';

export const consentHash = createHash('sha256').update(GUEST_CONSENT_TEXT).digest('hex');
const createSchema = z.object({ video_id: z.string().uuid(), clip_ids: z.array(z.string().uuid()).min(1).max(8),
  guest_name: z.string().trim().min(1).max(100), consent_confirmed: z.literal(true),
  consent_version: z.literal(GUEST_CONSENT_VERSION), consent_text_hash: z.literal(consentHash) }).strict();
const missing = () => new UploadError('not_found', 'Ссылка не найдена', 404);
interface Pack {
  id: string; code: string; account_id: string; guest_name: string; video_id: string;
  sent_at: Date | null; expires_at: Date | null; revoked_at: Date | null;
  plan: string; finished_at: Date | null; partner_code?: string;
}
const selectPack = `SELECT p.*,a.plan,v.finished_at,pc.code AS partner_code FROM guest_pack p LEFT JOIN partner_code pc ON pc.id=p.host_partner_code_id
  JOIN video v ON v.id=p.video_id AND v.account_id=p.account_id JOIN account a ON a.id=p.account_id
  WHERE v.deleted_at IS NULL AND a.status='active'`;
function summary(p: Pack): GuestPackSummary {
  return { guest_pack_id: p.id, guest_name: p.guest_name, url: `/g/${p.code}`,
    sent_at: p.sent_at?.toISOString() ?? null, expires_at: p.expires_at?.toISOString() ?? null,
    revoked_at: p.revoked_at?.toISOString() ?? null };
}
export class GuestPackService {
  constructor(private readonly pool: Pool, private readonly clock = () => new Date()) {}
  async create(account: string, input: unknown): Promise<GuestPackSummary> {
    // Validation is before BEGIN and every INSERT, including consent version and exact text hash.
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) throw new UploadError('invalid', 'Подтвердите согласие гостя и выберите готовые клипы', 422);
    const data = parsed.data, ids = [...new Set(data.clip_ids)], now = this.clock();
    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      const video = await tx.query(`SELECT v.id FROM video v JOIN account a ON a.id=v.account_id
        WHERE v.id=$1 AND v.account_id=$2 AND v.deleted_at IS NULL AND a.status='active' FOR SHARE OF v,a`, [data.video_id, account]);
      if (!video.rowCount) throw missing();
      const clips = await tx.query(`SELECT c.id FROM clip c JOIN video v ON v.id=c.video_id JOIN account a ON a.id=v.account_id
        WHERE c.video_id=$1 AND c.id=ANY($2::uuid[]) AND c.status='done' AND c.object_key IS NOT NULL
        AND (c.expires_at IS NULL OR c.expires_at>$3)
        AND (a.plan='paid' OR v.finished_at IS NULL OR v.finished_at+interval '72 hours'>$3) FOR SHARE OF c`, [data.video_id, ids, now]);
      if (clips.rowCount !== ids.length) throw new UploadError('invalid', 'Выберите доступные клипы из этой записи', 422);
      const pack = (await tx.query<Pack>(`INSERT INTO guest_pack
        (video_id,account_id,code,guest_name,consent_confirmed,consent_version,consent_text_hash,consent_at)
        VALUES ($1,$2,$3,$4,true,$5,$6,$7) RETURNING *`,
      [data.video_id, account, randomBytes(24).toString('base64url'), data.guest_name, data.consent_version, data.consent_text_hash, now])).rows[0]!;
      await tx.query(`INSERT INTO guest_pack_clip (guest_pack_id,clip_id) SELECT $1,unnest($2::uuid[])`, [pack.id, ids]);
      await tx.query('COMMIT');
      return summary(pack);
    } catch (error) { await tx.query('ROLLBACK'); throw error; }
    finally { tx.release(); }
  }
  async send(account: string, id: string): Promise<GuestPackSummary> {
    const tx = await this.pool.connect(), now = this.clock();
    try {
      await tx.query('BEGIN');
      const owned = (await tx.query<Pack>(`${selectPack} AND p.id=$1 AND p.account_id=$2 FOR UPDATE OF p`, [id, account])).rows[0];
      if (!owned) throw missing();
      if (owned.revoked_at || owned.sent_at) throw new UploadError('invalid', 'Пакет уже отправлен или отозван', 409);
      const personal = await ensurePartnerCode(tx, account);
      const pack = (await tx.query<Pack>(`UPDATE guest_pack SET host_partner_code_id=$3,sent_at=$2,expires_at=$2::timestamptz+interval '336 hours'
        WHERE id=$1 AND sent_at IS NULL AND revoked_at IS NULL RETURNING *`, [id, now, personal.id])).rows[0]!;
      await tx.query(`INSERT INTO growth_event (type,account_id,video_id,guest_pack_id,day)
        VALUES ('guest_sent',$1,$2,$3,$4::date)`, [account, pack.video_id, id, moscowDay(now)]);
      await tx.query('COMMIT'); return summary(pack);
    } catch (error) { await tx.query('ROLLBACK'); throw error; }
    finally { tx.release(); }
  }
  async revoke(account: string, id: string) {
    const row = (await this.pool.query<{ revoked_at: Date }>(`UPDATE guest_pack p SET revoked_at=COALESCE(p.revoked_at,$3)
      FROM video v,account a WHERE p.id=$1 AND p.account_id=$2 AND v.id=p.video_id AND v.account_id=$2
      AND v.deleted_at IS NULL AND a.id=$2 AND a.status='active' RETURNING p.revoked_at`, [id, account, this.clock()])).rows[0];
    if (!row) throw missing();
    return { revoked_at: row.revoked_at.toISOString() };
  }
  async list(account: string, video: string): Promise<GuestPackSummary[]> {
    return (await this.pool.query<Pack>(`${selectPack} AND p.account_id=$1 AND p.video_id=$2 ORDER BY p.created_at DESC`, [account, video])).rows.map(summary);
  }
  async find(code: string) {
    if (!/^[A-Za-z0-9_-]{32}$/.test(code)) throw missing();
    const now = this.clock();
    const pack = (await this.pool.query<Pack>(`${selectPack} AND p.code=$1 AND p.revoked_at IS NULL
      AND p.sent_at IS NOT NULL AND p.expires_at>$2`, [code, now])).rows[0];
    if (!pack) throw missing();
    const rows = (await this.pool.query<ClipRow>(`SELECT c.* FROM clip c JOIN guest_pack_clip pc ON pc.clip_id=c.id
      WHERE pc.guest_pack_id=$1 AND c.video_id=$2 ORDER BY c."index",c.id`, [pack.id, pack.video_id])).rows;
    return { ...pack, clips: rows.map(c => presentClip(c, pack, now)) };
  }
  async recordOpen(pack: { id: string; account_id: string }, account: string | null, prefix: string) {
    if (account === pack.account_id) return;
    const tx = await this.pool.connect(), now = this.clock();
    try {
      await tx.query('BEGIN');
      const inserted = await tx.query(`INSERT INTO growth_event (type,guest_pack_id,ip_prefix,day)
        SELECT 'guest_opened',id,$2::cidr,$3::date FROM guest_pack
        WHERE id=$1 AND revoked_at IS NULL AND sent_at IS NOT NULL AND expires_at>$4
        ON CONFLICT DO NOTHING RETURNING id`, [pack.id, prefix, moscowDay(now), now]);
      if (inserted.rowCount) await tx.query('UPDATE guest_pack SET first_opened_at=COALESCE(first_opened_at,$2) WHERE id=$1', [pack.id, now]);
      await tx.query('COMMIT');
    } catch (error) { await tx.query('ROLLBACK'); throw error; }
    finally { tx.release(); }
  }
}
