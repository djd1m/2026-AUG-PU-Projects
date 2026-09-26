import { z } from 'zod';
import { transaction, leaseAttemptTx, checkAndConsumeQuota, type Attempt, type Pool } from '@clipmaker/db';
import type { Limits } from '@clipmaker/shared/config';
import { CTA_KIND } from '@clipmaker/shared/enums';
import { effectiveMusic } from '@clipmaker/shared/music-catalog';
import { CTA_URL_MAX, CtaError, ctaPixelsChange, parseCtaTarget, type CtaTarget } from '@clipmaker/shared/cta';
import { UploadError, quotaError } from './upload-contract';
// video.setCta — 17-я процедура канона §5 (ADR-017). 27a: сохранение вида и адреса. 27b: если меняются ПИКСЕЛИ
// (сменился вид, в том числе none ↔ не-none) — пересборка ВСЕХ готовых клипов записи одной транзакцией:
//   1) одна проверка «что-то из записи уже собирается» по ВСЕЙ записи — 409 целиком ДО квоты;
//   2) квота user_rerenders ОДНИМ вызовом на N клипов — нехватка остатка откатывает всё, включая призыв;
//   3) сохранение призыва, версии клипов и попытки — в ОДНОЙ транзакции, постановка в очередь — после коммита.
// Смена одного адреса пикселей не меняет (адрес в кадр не вшивается) — сохраняется без пересборки и без квоты.
// Сервер по адресу не ходит (нет SSRF).
export const setCtaSchema = z.object({ video_id: z.string().uuid(), cta_kind: z.enum(CTA_KIND),
  cta_url: z.string().max(CTA_URL_MAX + 1).nullable().optional() }).strict();
export interface CtaResult { video_id: string; cta_kind: CtaTarget['kind']; cta_url: string | null; rerendering: number }
const FREE_RETENTION_MS = 3 * 86400_000;
export class VideoCtaService {
  constructor(private readonly pool: Pool, private readonly limits: Limits,
    private readonly enqueue: (attempt: Attempt) => Promise<void>, private readonly clock = () => new Date()) {}
  async setCta(account: string, raw: unknown): Promise<CtaResult> {
    const parsed = setCtaSchema.safeParse(raw);
    if (!parsed.success) throw new UploadError('invalid', 'Проверьте запись и выбранный призыв', 422);
    let cta: CtaTarget;
    try { cta = parseCtaTarget(parsed.data.cta_kind, parsed.data.cta_url); }
    catch (error) { if (error instanceof CtaError) throw new UploadError('invalid', error.message, 422, { field: 'cta_url' }); throw error; }
    const videoId = parsed.data.video_id;
    const jobs = await transaction(this.pool, async tx => {
      // Тот же порядок блокировок, что у рендера, повтора, сторожа и смены музыки: сначала video.
      const video = (await tx.query<{ cta_kind: string; music: boolean; finished_at: Date | null; plan: unknown }>(
        `SELECT v.cta_kind,v.music,v.finished_at,a.plan FROM video v JOIN account a ON a.id=v.account_id
        WHERE v.id=$1 AND v.account_id=$2 AND v.deleted_at IS NULL AND a.status='active' FOR UPDATE OF v`, [videoId, account])).rows[0];
      // Чужая и несуществующая запись неразличимы: одинаковый 404.
      if (!video) throw new UploadError('not_found', 'Запись не найдена', 404);
      // updated_at НЕ трогаем: по нему экран отличает «выполняется» от «нет ответа» (300 с молчания).
      const save = () => tx.query('UPDATE video SET cta_kind=$2,cta_url=$3 WHERE id=$1', [videoId, cta.kind, cta.url]);
      if (!ctaPixelsChange(video.cta_kind, cta.kind)) { await save(); return []; }
      const busy = await tx.query(`SELECT 1 FROM job_attempt WHERE video_id=$1 AND stage='render' AND status IN ('running','deferred')
        UNION ALL SELECT 1 FROM clip WHERE video_id=$1 AND status='rendering' LIMIT 1`, [videoId]);
      if (busy.rowCount) throw new UploadError('conflict', 'Клипы записи ещё собираются. Сменить призыв можно, когда сборка закончится', 409);
      const now = this.clock();
      const clips = (await tx.query<{ id: string; index: number; music_track_id: string | null; expires_at: Date | null }>(
        `SELECT id,"index",music_track_id,expires_at FROM clip WHERE video_id=$1 AND status='done' AND object_key IS NOT NULL
        ORDER BY "index" FOR UPDATE`, [videoId])).rows.filter(clip => {
        // Истёкший клип не пересобирается: его файл уже удалён или вот-вот будет удалён очисткой.
        const expires = clip.expires_at ?? (video.plan !== 'paid' && video.finished_at
          ? new Date(video.finished_at.getTime() + FREE_RETENTION_MS) : null);
        return !expires || expires > now;
      });
      await save();
      if (!clips.length) return [];
      const quota = await checkAndConsumeQuota(tx, this.limits, account, 'rerender', clips.length, now);
      // Исключение откатывает ВСЮ транзакцию: ни призыва, ни версий, ни попыток — отказ целиком.
      if (!quota.granted) throw quotaError(quota.scope, now);
      const series = (await tx.query<{ series: number }>('SELECT COALESCE(max(series_no),0)+1 AS series FROM job_attempt WHERE video_id=$1',
        [videoId])).rows[0]!.series;
      const leased: Attempt[] = [];
      for (const clip of clips) {
        // Отказ пересборки возвращает клипу ОТРИСОВАННЫЙ трек (retryRender): у старых клипов он не записан — фиксируем.
        await tx.query(`UPDATE clip SET render_version=render_version+1,rendered_music_track_id=COALESCE(rendered_music_track_id,$2)
          WHERE id=$1`, [clip.id, effectiveMusic(clip.music_track_id, video.music, clip.index)]);
        const attempt = await leaseAttemptTx(tx, videoId, 'render', series, clip.id, now, true);
        if (!attempt) throw new Error('Пересборка не получила попытку');
        leased.push(attempt);
      }
      return leased;
    });
    // Коммит авторитетен. Потерянную доставку восстановит сторож.
    for (const job of jobs) {
      try { await this.enqueue(job); } catch (error) { console.error('Пересборка сохранена; сторож восстановит доставку', error); }
    }
    return { video_id: videoId, cta_kind: cta.kind, cta_url: cta.url, rerendering: jobs.length };
  }
}
