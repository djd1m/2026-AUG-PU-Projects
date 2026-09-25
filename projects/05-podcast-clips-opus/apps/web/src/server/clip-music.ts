import { z } from 'zod';
import { MUSIC_CATALOG, effectiveMusic } from '@clipmaker/shared/music-catalog';
import type { Limits } from '@clipmaker/shared/config';
import { transaction, leaseAttemptTx, checkAndConsumeQuota, type Attempt, type Pool } from '@clipmaker/db';
import { UploadError, quotaError } from './upload-contract';
export const setMusicSchema = z.object({ clip_id: z.string().uuid(), track: z.string().refine(
  value => value === 'auto' || value === 'none' || MUSIC_CATALOG.some(track => track.id === value), 'Неизвестный трек') }).strict();
export class ClipMusicService {
  constructor(private readonly pool: Pool, private readonly limits: Limits,
    private readonly enqueue: (attempt: Attempt) => Promise<void>, private readonly clock = () => new Date()) {}
  async setMusic(account: string, raw: unknown) {
    const parsed = setMusicSchema.safeParse(raw);
    if (!parsed.success) throw new UploadError('invalid', 'Проверьте клип и выбранный трек', 422);
    const input = parsed.data;
    const job = await transaction(this.pool, async tx => {
      // Same lock order as render/retry/watchdog: video before clip.
      const video = (await tx.query(`SELECT v.*,a.plan FROM video v JOIN account a ON a.id=v.account_id
        JOIN clip c ON c.video_id=v.id WHERE c.id=$1 AND v.account_id=$2
        AND v.deleted_at IS NULL AND a.status='active' FOR UPDATE OF v`, [input.clip_id, account])).rows[0];
      if (!video) throw new UploadError('not_found', 'Клип не найден', 404);
      const clip = (await tx.query('SELECT * FROM clip WHERE id=$1 FOR UPDATE', [input.clip_id])).rows[0];
      const active = await tx.query(`SELECT 1 FROM job_attempt WHERE clip_id=$1 AND stage='render'
        AND status IN ('running','deferred')`, [input.clip_id]);
      if (video.status !== 'done' || clip.status !== 'done' || active.rowCount) {
        throw new UploadError('conflict', 'Клип ещё собирается', 409);
      }
      const now = this.clock();
      const expires = clip.expires_at ?? (video.plan !== 'paid' && video.finished_at
        ? new Date(video.finished_at.getTime() + 3 * 86400_000) : null);
      if (!clip.object_key || (expires && expires <= now)) throw new UploadError('conflict', 'Срок хранения клипа истёк', 409);
      const target = effectiveMusic(input.track, video.music, clip.index);
      const rendered = clip.rendered_music_track_id ?? effectiveMusic(clip.music_track_id, video.music, clip.index);
      if (clip.music_skip_reason && target === effectiveMusic(clip.music_track_id, video.music, clip.index)) {
        throw new UploadError('conflict', 'Музыка не подошла по громкости; выберите другой трек', 409);
      }
      if (target === rendered) throw new UploadError('conflict', 'Уже выбран этот трек', 409);
      const quota = await checkAndConsumeQuota(tx, this.limits, account, 'rerender', 1, now);
      if (!quota.granted) throw quotaError(quota.scope, now);
      // Legacy clips have no recorded mixed track; preserve their prior equivalent on failure.
      await tx.query(`UPDATE clip SET music_track_id=$2,render_version=render_version+1,
        rendered_music_track_id=COALESCE(rendered_music_track_id,$3) WHERE id=$1`,
      [input.clip_id, input.track === 'auto' ? null : input.track, rendered]);
      const series = (await tx.query('SELECT COALESCE(max(series_no),0)+1 AS series FROM job_attempt WHERE video_id=$1', [video.id])).rows[0].series;
      const attempt = await leaseAttemptTx(tx, video.id, 'render', series, clip.id, now, true);
      if (!attempt) throw new Error('Пересборка не получила попытку');
      return attempt;
    });
    try { await this.enqueue(job); }
    catch (error) { console.error('Пересборка сохранена; сторож восстановит доставку', error); }
    return { clip_id: input.clip_id, rerendering: true };
  }
}
