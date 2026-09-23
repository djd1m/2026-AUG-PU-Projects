import type { Pool } from '@clipmaker/db';
import { z } from 'zod';
import { moscowDay } from '@clipmaker/shared/upload';
import { UploadError } from './upload-contract';

export const applyCodeSchema = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9_-]{6,12}$/),
  source: z.enum(['explicit', 'guest_link', 'cookie']).default('explicit') }).strict();
export type AttributionSource = 'explicit' | 'guest_link' | 'cookie';
export interface Attribution {
  id: string; partner_code_id: string; source: AttributionSource;
  status: 'pending' | 'activated' | 'rejected'; replaced_source: AttributionSource | null;
  reject_reason: string | null;
}
const invalid = (reason = 'invalid_code') => new UploadError('invalid',
  reason === 'code_blocked' ? 'Код заблокирован' : 'Код не найден или недействителен', 422, { reason });
const conflict = () => new UploadError('conflict', 'Источник уже выбран и не может быть заменён этим кодом', 409);

// ADR-007: keep the asymmetric outcomes visible, including equal-source conflicts.
export function replacementAllowed(existing: Attribution, source: AttributionSource): boolean {
  if (existing.source === 'explicit') return false; // explicit → any: 409
  if (existing.status === 'rejected') return false;
  if (existing.source === 'guest_link' && source === 'cookie') return false; // 409
  if (existing.source === 'cookie' && source === 'explicit') return true; // 200 + replaced_source
  return (existing.source === 'cookie' && source === 'guest_link') ||
    (existing.source === 'guest_link' && source === 'explicit');
}

export class PartnerService {
  constructor(private readonly pool: Pool, private readonly clock = () => new Date()) {}
  async apply(account: string, raw: unknown, prefix: string): Promise<Attribution> {
    const parsed = applyCodeSchema.safeParse(raw);
    if (!parsed.success) throw invalid(); // invalid → 422; NEVER fall back to cookie
    const input = parsed.data, tx = await this.pool.connect();
    let result: Attribution | UploadError;
    try {
      await tx.query('BEGIN');
      // Same account first, then same code: one lock order even for concurrent replacements.
      const active = await tx.query("SELECT id FROM account WHERE id=$1 AND status='active' FOR NO KEY UPDATE", [account]);
      if (!active.rowCount) throw new UploadError('not_found', 'Аккаунт не найден', 404);
      const code = (await tx.query<{ id: string; status: string; account_id: string }>(`SELECT c.id,c.status,p.account_id
        FROM partner_code c JOIN partner p ON p.id=c.partner_id JOIN account a ON a.id=p.account_id
        WHERE c.code=$1 AND a.status='active' FOR NO KEY UPDATE OF c`, [input.code])).rows[0];
      if (!code) throw invalid();
      if (code.status !== 'active') throw invalid('code_blocked');
      const now = this.clock();
      // Count attempts, including conflicts/rejections. The 50th attempt is recorded and refused.
      // Business refusals commit this audit and the code block; infrastructure errors roll back.
      await tx.query(`INSERT INTO growth_event(type,account_id,partner_code_id,ip_prefix,day,created_at)
        VALUES('code_applied',$1,$2,$3::cidr,$4::date,$5)`, [account, code.id, prefix, moscowDay(now), now]);
      const count = Number((await tx.query<{ count: string }>(`SELECT count(*) FROM growth_event
        WHERE type='code_applied' AND partner_code_id=$1 AND ip_prefix=$2::cidr
        AND created_at > $3::timestamptz - interval '10 minutes' AND created_at <= $3`, [code.id, prefix, now])).rows[0]!.count);
      if (count >= 50) {
        await tx.query(`UPDATE partner_code SET status='blocked',blocked_reason='antifraud_ip_burst',blocked_at=$2
          WHERE id=$1 AND status='active'`, [code.id, now]);
        result = invalid('code_blocked');
      } else {
        const existing = (await tx.query<Attribution>('SELECT * FROM attribution WHERE account_id=$1 FOR UPDATE', [account])).rows[0];
        if (existing && !replacementAllowed(existing, input.source)) result = conflict();
        else {
          const self = code.account_id === account;
          const values = [account, code.id, input.source, self ? 'rejected' : 'pending', self ? 'self_referral' : null];
          const inserted = await tx.query<Attribution>(`INSERT INTO attribution(account_id,partner_code_id,source,status,reject_reason)
            VALUES($1,$2,$3,$4,$5) ON CONFLICT(account_id) DO NOTHING RETURNING *`, values);
          const updated = inserted.rows[0] ? inserted : await tx.query<Attribution>(`UPDATE attribution
            SET partner_code_id=$2,replaced_source=source,source=$3,status=$4,reject_reason=$5,activated_at=NULL
            WHERE account_id=$1 AND status <> 'rejected' AND
              (($3='explicit' AND source IN ('cookie','guest_link')) OR ($3='guest_link' AND source='cookie')) RETURNING *`, values);
          result = updated.rows[0] ?? conflict();
          if (!(result instanceof UploadError) && !self && input.source === 'guest_link') {
            await tx.query(`INSERT INTO growth_event(type,account_id,partner_code_id,ip_prefix,day,created_at)
              VALUES('guest_registered',$1,$2,$3::cidr,$4::date,$5)`, [account, code.id, prefix, moscowDay(now), now]);
          }
        }
      }
      await tx.query('COMMIT');
    } catch (error) { await tx.query('ROLLBACK'); throw error; }
    finally { tx.release(); }
    if (result instanceof UploadError) throw result;
    return result;
  }

  async dashboard(account: string, codeId?: string) {
    const codes = (await this.pool.query<{ id: string; code: string; status: 'active' | 'blocked'; blocked_reason: string | null }>(
      `SELECT c.id,c.code,c.status,c.blocked_reason FROM partner_code c JOIN partner p ON p.id=c.partner_id
       WHERE p.account_id=$1 ORDER BY c.created_at,c.id`, [account])).rows;
    if (codeId && !codes.some(c => c.id === codeId)) {
      throw new UploadError('invalid', 'Нет доступа к этому партнёрскому коду', 403);
    }
    const ids = codes.filter(c => !codeId || c.id === codeId).map(c => c.id);
    const count = async (sql: string) => Number((await this.pool.query<{ count: string }>(sql, [ids])).rows[0]!.count);
    // Five independent aggregates: joins cannot multiply registrations, videos or clips.
    const visits = await count(`SELECT count(*) FROM growth_event e WHERE e.type IN ('link_view','guest_opened')
      AND (e.partner_code_id=ANY($1::uuid[]) OR (e.type='guest_opened' AND EXISTS
        (SELECT 1 FROM guest_pack g WHERE g.id=e.guest_pack_id AND g.host_partner_code_id=ANY($1::uuid[]))))`);
    const registrations = await count("SELECT count(*) FROM attribution WHERE partner_code_id=ANY($1::uuid[]) AND status <> 'rejected'");
    const uploaded = await count(`SELECT count(*) FROM video v JOIN attribution a ON a.account_id=v.account_id
      WHERE a.partner_code_id=ANY($1::uuid[]) AND a.status <> 'rejected' AND v.deleted_at IS NULL
      AND (v.upload_enqueued_at IS NOT NULL OR v.status IN ('queued','transcribing','selecting','rendering','done'))`);
    const shared = await count(`SELECT count(*) FROM clip c JOIN video v ON v.id=c.video_id
      JOIN attribution a ON a.account_id=v.account_id JOIN clip_link l ON l.clip_id=c.id
      WHERE a.partner_code_id=ANY($1::uuid[]) AND a.status <> 'rejected' AND l.unique_view_count > 0`);
    const guests = await count("SELECT count(*) FROM attribution WHERE partner_code_id=ANY($1::uuid[]) AND source='guest_link' AND status <> 'rejected'");
    const statuses = (await this.pool.query<{ partner_code_id: string; source: AttributionSource; status: Attribution['status']; count: string }>(
      `SELECT partner_code_id,source,status,count(*) FROM attribution WHERE partner_code_id=ANY($1::uuid[])
       GROUP BY partner_code_id,source,status ORDER BY partner_code_id,source,status`, [ids])).rows.map(r => ({ ...r, count: Number(r.count) }));
    return { codes: codes.filter(c => !codeId || c.id === codeId), counters: { visits, registrations, uploaded, shared, guests }, statuses };
  }
}
