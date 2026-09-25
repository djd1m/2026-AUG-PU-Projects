import { z } from 'zod';
import type { Pool } from '@clipmaker/db';
import { CTA_KIND } from '@clipmaker/shared/enums';
import { CTA_URL_MAX, CtaError, parseCtaTarget, type CtaTarget } from '@clipmaker/shared/cta';
import { UploadError } from './upload-contract';
// video.setCta — 17-я процедура канона §5 (ADR-017, часть 27a): ТОЛЬКО сохраняет вид и адрес призыва.
// Пересборки клипов здесь нет (27b), квота не списывается. Сервер по адресу не ходит (нет SSRF).
export const setCtaSchema = z.object({ video_id: z.string().uuid(), cta_kind: z.enum(CTA_KIND),
  cta_url: z.string().max(CTA_URL_MAX + 1).nullable().optional() }).strict();
export interface CtaResult { video_id: string; cta_kind: CtaTarget['kind']; cta_url: string | null }
export class VideoCtaService {
  constructor(private readonly pool: Pool) {}
  async setCta(account: string, raw: unknown): Promise<CtaResult> {
    const parsed = setCtaSchema.safeParse(raw);
    if (!parsed.success) throw new UploadError('invalid', 'Проверьте запись и выбранный призыв', 422);
    let cta: CtaTarget;
    try { cta = parseCtaTarget(parsed.data.cta_kind, parsed.data.cta_url); }
    catch (error) { if (error instanceof CtaError) throw new UploadError('invalid', error.message, 422, { field: 'cta_url' }); throw error; }
    // updated_at НЕ трогаем: по нему экран отличает «выполняется» от «нет ответа» (300 с молчания),
    // и смена призыва не должна маскировать зависшую обработку.
    const saved = await this.pool.query(`UPDATE video v SET cta_kind=$3,cta_url=$4 FROM account a
      WHERE a.id=v.account_id AND v.id=$1 AND v.account_id=$2 AND v.deleted_at IS NULL AND a.status='active'`,
    [parsed.data.video_id, account, cta.kind, cta.url]);
    // Чужая и несуществующая запись неразличимы: одинаковый 404.
    if (!saved.rowCount) throw new UploadError('not_found', 'Запись не найдена', 404);
    return { video_id: parsed.data.video_id, cta_kind: cta.kind, cta_url: cta.url };
  }
}
