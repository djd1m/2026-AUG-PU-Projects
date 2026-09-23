import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { transaction, checkAndConsumeQuota, refundUploadSlot, type Pool, type PoolClient } from '@clipmaker/db';
import type { Limits } from '@clipmaker/shared/config';
import type { VideoFailureReason, VideoStatus } from '@clipmaker/shared/enums';
import { MAX_UPLOAD_BYTES, moscowDay } from '@clipmaker/shared/upload';
import { calculatePartSize, UploadTooLarge, type SignedPart, type CompletedPart } from '@clipmaker/s3';
import { createVideoSchema, completeUploadSchema, UploadError, quotaError } from './upload-contract';
import { isAllowedMedia } from './media-type';
export interface UploadStorage {
  initiate(key: string): Promise<string>;
  sign(key: string, uploadId: string, numbers: number | number[], now: Date): Promise<SignedPart[]>;
  list(key: string, uploadId: string): Promise<CompletedPart[]>;
  complete(key: string, uploadId: string, parts: CompletedPart[]): Promise<void>;
  abort(key: string, uploadId: string): Promise<void>;
  head(key: string): Promise<bigint>;
  bytes(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}
export interface UploadData {
  video_id: string; upload_id: string; part_size: number; parts: SignedPart[]; completed_parts?: CompletedPart[];
}
interface VideoRow {
  id: string; account_id: string; upload_id: string | null; object_key: string; declared_bytes: string;
  status: VideoStatus; failure_reason: VideoFailureReason | null; upload_parts: SignedPart[] | null;
  upload_part_size: number; upload_day: string; upload_enqueued_at: Date | null;
}
const selectVideo = `SELECT *, upload_day::text AS upload_day FROM video`;
const unavailable = () => new UploadError('unavailable', 'Хранилище временно недоступно. Повторите завершение этой загрузки', 503);
export class VideoService {
  constructor(private readonly pool: Pool, private readonly limits: Limits, private readonly storage: UploadStorage,
    private readonly enqueue: (videoId: string, fence: number) => Promise<void>, private readonly clock = () => new Date()) {}
  async create(account: string, key: unknown, input: unknown): Promise<UploadData> {
    const parsed = createVideoSchema.safeParse(input);
    if (!parsed.success || !z.string().uuid().safeParse(key).success) throw new UploadError('invalid', 'Проверьте имя, размер файла и ключ запроса', 422);
    const body = parsed.data, now = this.clock();
    // Заявка и квота фиксируются до сети. upload_id=NULL — восстанавливаемая инициализация.
    const claimed = await transaction(this.pool, async (tx) => {
      const active = await tx.query("SELECT id FROM account WHERE id=$1 AND status='active' FOR SHARE", [account]);
      if (!active.rowCount) throw new UploadError('not_found', 'Аккаунт не найден', 404);
      const id = randomUUID();
      const ext = body.filename.split('.').pop()?.toLowerCase();
      const objectKey = `videos/${account}/${id}/source.${ext && ['mp4', 'mov', 'webm', 'm4a', 'mp3'].includes(ext) ? ext : 'bin'}`;
      const claim = await tx.query<VideoRow>(`INSERT INTO video
        (id, account_id, idempotency_key, status, source, declared_bytes, upload_day, object_key, upload_part_size)
        VALUES ($1, $2, $3, 'uploading', 'upload', $4, $5, $6, $7)
        ON CONFLICT (account_id, idempotency_key) DO NOTHING RETURNING *, upload_day::text AS upload_day`,
      [id, account, key, BigInt(body.declared_bytes), moscowDay(now), objectKey, calculatePartSize(body.declared_bytes)]);
      if (claim.rowCount) {
        const quota = await checkAndConsumeQuota(tx, this.limits, account, 'upload', 1, now);
        if (!quota.granted) {
          await tx.query("UPDATE video SET status='failed', failure_reason='refused_user_uploads', finished_at=now() WHERE id=$1", [id]);
          return quotaError(quota.scope, now);
        }
        return claim.rows[0]!;
      }
      return (await tx.query<VideoRow>(`${selectVideo} WHERE account_id=$1 AND idempotency_key=$2 AND deleted_at IS NULL`, [account, key])).rows[0];
    });
    if (claimed instanceof UploadError) throw claimed;
    if (!claimed) throw new UploadError('not_found', 'Запись не найдена', 404);
    let row = claimed;
    if (row.failure_reason === 'refused_user_uploads') throw quotaError('user_uploads', now);
    if (row.status !== 'uploading') throw new UploadError('conflict', 'Загрузка уже завершена', 409);
    if (Number(row.declared_bytes) !== body.declared_bytes) throw new UploadError('conflict', 'Ключ уже привязан к другому размеру файла', 409);
    if (!row.upload_id) {
      const objectKey = row.object_key;
      const uploadId = await this.storage.initiate(objectKey);
      // Конкурентные create выбирают один upload_id условным UPDATE. Соединение не ждёт S3.
      const saved = await this.pool.query<VideoRow>(`UPDATE video SET upload_id=$2, updated_at=now()
        WHERE id=$1 AND upload_id IS NULL AND status='uploading' AND deleted_at IS NULL
        RETURNING *, upload_day::text AS upload_day`, [row.id, uploadId]);
      if (saved.rowCount) row = saved.rows[0]!;
      else {
        row = (await this.pool.query<VideoRow>(`${selectVideo} WHERE id=$1 AND deleted_at IS NULL`, [row.id])).rows[0]!;
        if (row?.upload_id !== uploadId) await this.cleanup(() => this.storage.abort(objectKey, uploadId), 'abort unclaimed multipart');
        if (!row || row.status !== 'uploading') throw new UploadError('conflict', 'Загрузка уже завершена', 409);
      }
    }
    if (!row.upload_id) throw unavailable();
    const completed = await this.storage.list(row.object_key, row.upload_id);
    const count = Math.ceil(Number(row.declared_bytes) / row.upload_part_size);
    if (completed.some((part) => part.part_number > count)) throw new UploadError('invalid', 'Лишние части файла', 422);
    const done = new Set(completed.map((part) => part.part_number));
    const missing = Array.from({ length: count }, (_, i) => i + 1).filter((n) => !done.has(n));
    let parts = row.upload_parts ?? [];
    if (missing.some((n) => !parts.some((p) => p.part_number === n && Date.parse(p.expires_at) > now.getTime()))) {
      parts = await this.storage.sign(row.object_key, row.upload_id, missing, now);
      // Сохраняем первый набор подписей, либо заменяем именно прочитанную версию.
      await this.pool.query(`UPDATE video SET upload_parts=$2, updated_at=now() WHERE id=$1 AND status='uploading'
        AND upload_parts IS NOT DISTINCT FROM $3::jsonb`, [row.id, JSON.stringify(parts), row.upload_parts === null ? null : JSON.stringify(row.upload_parts)]);
      const current = (await this.pool.query<VideoRow>(`${selectVideo} WHERE id=$1 AND deleted_at IS NULL`, [row.id])).rows[0];
      if (!current || current.status !== 'uploading') throw new UploadError('conflict', 'Загрузка уже завершена', 409);
      // При гонке можно выдать собственные действующие подписи: ключ/id те же, квота та же.
      if (missing.every((n) => current.upload_parts?.some((p) => p.part_number === n && Date.parse(p.expires_at) > now.getTime()))) parts = current.upload_parts!;
    }
    return { video_id: row.id, upload_id: row.upload_id, part_size: row.upload_part_size,
      parts: parts.filter((p) => missing.includes(p.part_number)), ...(completed.length ? { completed_parts: completed } : {}) };
  }
  private fileError(reason: 'too_large' | 'not_media') {
    return new UploadError('invalid', reason === 'too_large' ? 'Файл больше 2 000 000 000 байт' : 'Файл не является видео или аудио', 422, { reason });
  }
  private async cleanup(operation: () => Promise<void>, operationName: string) {
    try { await operation(); }
    catch { console.error(`Upload cleanup failed: ${operationName}; повтор завершения повторит очистку`); }
  }
  private async cleanupFile(row: VideoRow) {
    if (row.upload_id) await this.cleanup(() => this.storage.abort(row.object_key, row.upload_id!), 'abort');
    await this.cleanup(() => this.storage.delete(row.object_key), 'delete');
  }
  private async failFile(tx: PoolClient, row: VideoRow, reason: 'too_large' | 'not_media') {
    await tx.query("UPDATE video SET status='failed', failure_reason=$2, finished_at=now(), updated_at=now() WHERE id=$1", [row.id, reason]);
    await refundUploadSlot(tx, this.limits, row.account_id, row.upload_day, reason, this.clock());
    return { row, reason };
  }
  async complete(account: string, input: unknown): Promise<{ video_id: string; status: 'queued' }> {
    const parsed = completeUploadSchema.safeParse(input);
    if (!parsed.success) throw new UploadError('invalid', 'Проверьте идентификатор и список частей', 422);
    const body = parsed.data;
    const row = (await this.pool.query<VideoRow>(`${selectVideo} WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL`, [body.video_id, account])).rows[0];
    if (!row) throw new UploadError('not_found', 'Запись не найдена', 404);
    if (row.status === 'queued') return row.upload_enqueued_at ? { video_id: row.id, status: 'queued' } : this.publish(row.id);
    if (row.status === 'failed' && (row.failure_reason === 'too_large' || row.failure_reason === 'not_media')) {
      await this.cleanupFile(row); throw this.fileError(row.failure_reason);
    }
    if (row.status !== 'uploading') throw new UploadError('conflict', 'Загрузка уже завершена', 409);
    if (!row.upload_id) throw unavailable();
    let reason: 'too_large' | 'not_media' | undefined, bytes: bigint | undefined;
    // Ни Complete, ни HEAD, ни Range, ни очистка не держат транзакцию/соединение.
    try { await this.storage.complete(row.object_key, row.upload_id, body.parts); }
    catch (error) {
      if (error instanceof UploadTooLarge) reason = 'too_large';
      else {
        // Ответ мог потеряться после склейки; иначе сохраняем части и повтор тем же ключом.
        try { bytes = await this.storage.head(row.object_key); } catch { throw unavailable(); }
      }
    }
    if (!reason) {
      bytes ??= await this.storage.head(row.object_key);
      if (bytes > BigInt(MAX_UPLOAD_BYTES)) reason = 'too_large';
      else if (!isAllowedMedia(await this.storage.bytes(row.object_key))) reason = 'not_media';
    }
    const outcome = await transaction(this.pool, async (tx) => {
      const current = (await tx.query<VideoRow>(`${selectVideo} WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL FOR UPDATE`, [row.id, account])).rows[0];
      if (!current) throw new UploadError('not_found', 'Запись не найдена', 404);
      if (current.status === 'queued') return current.id;
      if (current.status === 'failed' && (current.failure_reason === 'too_large' || current.failure_reason === 'not_media')) {
        return { row: current, reason: current.failure_reason };
      }
      if (current.status !== 'uploading' || current.upload_id !== row.upload_id) throw new UploadError('conflict', 'Состояние загрузки изменилось', 409);
      if (bytes !== undefined) await tx.query('UPDATE video SET actual_bytes=$2 WHERE id=$1', [row.id, bytes]);
      if (reason) return this.failFile(tx, current, reason);
      await tx.query("UPDATE video SET status='queued', updated_at=now() WHERE id=$1", [row.id]);
      return row.id;
    });
    if (typeof outcome !== 'string') {
      await this.cleanupFile(outcome.row); throw this.fileError(outcome.reason);
    }
    return this.publish(outcome);
  }
  private async publish(id: string): Promise<{ video_id: string; status: 'queued' }> {
    await this.enqueue(id, 1); // Только ПОСЛЕ COMMIT; jobId транспорта идемпотентен.
    await this.pool.query("UPDATE video SET upload_enqueued_at=now() WHERE id=$1 AND status='queued'", [id]);
    return { video_id: id, status: 'queued' };
  }
}
