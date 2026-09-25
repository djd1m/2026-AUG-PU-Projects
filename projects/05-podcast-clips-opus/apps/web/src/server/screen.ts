import type { Pool } from '@clipmaker/db';
import { FILE_FAILURES } from '@clipmaker/db';
import type { VideoStatus, VideoFailureReason, ClipStatus } from '@clipmaker/shared/enums';
import { moscowDay, quotaResetAt } from '@clipmaker/shared/upload';
import { failureMessages, scoreSchema, type VideoScreen, type ClipScreen } from '../lib/screen-contract';
import { UploadError } from './upload-contract';
import { assertRetryable } from './video-retry';

export interface VideoRow {
  id: string; status: VideoStatus; created_at: Date; updated_at: Date; finished_at: Date | null;
  duration_seconds: string | null; stage_progress: number | null; clips_done: number | null; clips_total: number | null;
  failure_reason: VideoFailureReason | null; object_key: string | null; actual_bytes: string | null;
  plan: string; wait_reason: string | null;
}
export function presentVideo(row: VideoRow, now = new Date()): VideoScreen {
  const state = row.status === 'done' ? 'успех' : row.status === 'failed' ? 'отказ' : 'выполняется';
  const noResponse = state === 'выполняется' && now.getTime() - row.updated_at.getTime() > 300_000;
  const stages = { uploading: 'Загружаем файл', queued: 'Ждём очереди', transcribing: 'Расшифровываем',
    selecting: 'Выбираем фрагменты', rendering: `Режем: готово ${row.clips_done ?? 0} из ${row.clips_total ?? 0}`,
    done: 'Клипы готовы', failed: 'Обработка не завершена' };
  let nextAction: VideoScreen['next_action'] = null;
  if (row.status === 'failed') {
    if (row.failure_reason === 'refused_user_uploads') nextAction = 'tomorrow';
    else if (row.failure_reason && FILE_FAILURES.includes(row.failure_reason)) nextAction = 'upload';
    else {
      try { assertRetryable(row); nextAction = 'retry'; } catch { nextAction = 'upload'; }
    }
    if (row.clips_total && row.clips_done === row.clips_total) nextAction = null;
  }
  return { video_id: row.id, status: row.status, created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString(),
    duration_seconds: row.duration_seconds === null ? null : Number(row.duration_seconds), user_state: state,
    stage_label: noResponse ? 'Нет ответа от обработки, проверяем' : row.wait_reason === 'no_disk' && state === 'выполняется' ? 'Ждём свободного места' : stages[row.status],
    stage_progress: row.stage_progress, clips_done: row.clips_done ?? 0, clips_total: row.clips_total ?? 0,
    no_response: noResponse, failure_reason: row.failure_reason ? failureMessages[row.failure_reason] : null, next_action: nextAction,
    retry_after: row.failure_reason?.startsWith('refused_') ? quotaResetAt(row.updated_at) : null, poll_after_seconds: 5 };
}
const videoSelect = `SELECT v.*, a.plan, (SELECT j.wait_reason FROM job_attempt j
  WHERE j.video_id=v.id AND j.status='deferred' ORDER BY j.fence DESC LIMIT 1) AS wait_reason
  FROM video v JOIN account a ON a.id=v.account_id WHERE v.account_id=$1 AND a.status='active' AND v.deleted_at IS NULL`;
const notFound = () => new UploadError('not_found', 'Запись не найдена', 404);
export class ScreenService {
  constructor(private readonly pool: Pool, private readonly clock = () => new Date()) {}
  private async owned(account: string, id: string) {
    const row = (await this.pool.query<VideoRow>(`${videoSelect} AND v.id=$2`, [account, id])).rows[0];
    if (!row) throw notFound();
    return row;
  }
  async get(account: string, id: string) { return presentVideo(await this.owned(account, id), this.clock()); }
  async list(account: string, input: { cursor?: string; limit?: number }) {
    const limit = input.limit ?? 20;
    const rows = (await this.pool.query<VideoRow>(`${videoSelect}
      AND ($2::uuid IS NULL OR (v.created_at,v.id) < (SELECT created_at,id FROM video WHERE id=$2 AND account_id=$1 AND deleted_at IS NULL))
      ORDER BY v.created_at DESC,v.id DESC LIMIT $3`, [account, input.cursor ?? null, limit + 1])).rows;
    return { videos: rows.slice(0, limit).map(row => presentVideo(row, this.clock())),
      next_cursor: rows.length > limit ? rows[limit - 1]!.id : null };
  }
  async clips(account: string, id: string): Promise<{ clips: ClipScreen[] }> {
    const video = await this.owned(account, id);
    const rows = (await this.pool.query<ClipRow>(`SELECT c.*,EXISTS (SELECT 1 FROM job_attempt j WHERE j.clip_id=c.id AND j.rerender
      AND j.fence=c.render_fence AND j.status IN ('running','deferred')) AS rerendering,
      (SELECT j.failure_reason FROM job_attempt j WHERE j.clip_id=c.id AND j.rerender
        AND j.fence=c.render_fence AND j.status='failed') AS rerender_failure
      FROM clip c WHERE c.video_id=$1 ORDER BY c.index,c.id`, [id])).rows;
    return { clips: rows.map(row => presentClip(row, video, this.clock())) };
  }
  async markDownloaded(account: string, id: string) {
    const result = await this.pool.query(`INSERT INTO growth_event (type, account_id, clip_id, day)
      SELECT 'download',$1,c.id,$3::date FROM clip c JOIN video v ON v.id=c.video_id JOIN account a ON a.id=v.account_id
      WHERE c.id=$2 AND v.account_id=$1 AND a.status='active' AND v.deleted_at IS NULL
      AND c.status='done' AND c.object_key IS NOT NULL AND (c.expires_at IS NULL OR c.expires_at>now())
      AND (a.plan='paid' OR v.finished_at IS NULL OR v.finished_at + interval '72 hours'>now()) RETURNING id`, [account, id, moscowDay(this.clock())]);
    if (!result.rowCount) throw notFound();
    return { recorded: true };
  }
}
export interface ClipRow {
  rendered_music_track_id?: string | null; music_skip_reason?: string | null; rerender_failure?: string | null;
  music_track_id?: string | null; render_version?: number; rerendering?: boolean;
  duration_seconds?: string | null;
  id: string; index: number; start_seconds: string; end_seconds: string; title: string; status: ClipStatus;
  watermarked: boolean; object_key: string | null; expires_at: Date | null;
  score: number | null; score_hook: number | null; score_completeness: number | null; score_length: number | null;
  explain_hook: string | null; explain_completeness: string | null; explain_length: string | null;
}
export function presentClip(row: ClipRow, video: Pick<VideoRow, 'plan' | 'finished_at'>, now: Date): ClipScreen {
  const expires = row.expires_at ?? (video.plan !== 'paid' && video.finished_at ? new Date(video.finished_at.getTime() + 3 * 86400_000) : null);
  const score = row.score === null ? {} : scoreSchema.parse({ score: row.score,
    components: { hook: row.score_hook, completeness: row.score_completeness, length: row.score_length },
    explanations: { hook: row.explain_hook, completeness: row.explain_completeness, length: row.explain_length } });
  return { rendered_music_track_id: row.rendered_music_track_id ?? null, music_skip_reason: row.music_skip_reason ?? null,
    rerender_failure: row.rerender_failure ?? null,
    published_render_version: Number(row.object_key?.match(/-v(\d+)\.mp4$/)?.[1] ?? 1), music_track_id: row.music_track_id ?? null, render_version: row.render_version ?? 1, rerendering: row.rerendering ?? false, duration_seconds: row.duration_seconds == null ? null : Number(row.duration_seconds), clip_id: row.id, index: row.index, start: Number(row.start_seconds), end: Number(row.end_seconds), title: row.title,
    status: row.status, watermarked: row.watermarked, expires_at: expires?.toISOString() ?? null,
    available: row.status === 'done' && !!row.object_key && (!expires || expires > now), ...score };
}
