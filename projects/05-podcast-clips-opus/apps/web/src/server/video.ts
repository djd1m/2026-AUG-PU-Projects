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
  sign(key: string, uploadId: string, count: number, now: Date): Promise<SignedPart[]>;
  complete(key: string, uploadId: string, parts: CompletedPart[]): Promise<void>;
  abort(key: string, uploadId: string): Promise<void>;
  head(key: string): Promise<bigint>;
  bytes(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}
export interface UploadData { video_id: string; upload_id: string; part_size: number; parts: SignedPart[] }
interface VideoRow {
  id: string; account_id: string; upload_id: string; object_key: string; declared_bytes: string;
  status: VideoStatus; failure_reason: VideoFailureReason | null; upload_parts: SignedPart[];
  upload_part_size: number; upload_day: string; upload_enqueued_at: Date | null;
}
const selectVideo = `SELECT *, upload_day::text AS upload_day FROM video`;
export class VideoService {
  constructor(private readonly pool: Pool, private readonly limits: Limits, private readonly storage: UploadStorage,
    private readonly enqueue: (videoId: string, fence: number) => Promise<void>, private readonly clock = () => new Date()) {}
  async create(account: string, key: unknown, input: unknown): Promise<UploadData> {
    const parsed = createVideoSchema.safeParse(input);
    if (!parsed.success || !z.string().uuid().safeParse(key).success) throw new UploadError('invalid', 'Проверьте имя, размер файла и ключ запроса', 422);
    const body = parsed.data;
    let initiated: { key: string; id: string } | undefined;
    let result: UploadData | UploadError;
    try {
      result = await transaction(this.pool, async (tx) => {
        const now = this.clock(), id = randomUUID();
        const claim = await tx.query<{ id: string }>(`INSERT INTO video
          (id, account_id, idempotency_key, status, source, declared_bytes, upload_day)
          VALUES ($1, $2, $3, 'uploading', 'upload', $4, $5)
          ON CONFLICT (account_id, idempotency_key) DO NOTHING RETURNING id`, [id, account, key, BigInt(body.declared_bytes), moscowDay(now)]);
        if (!claim.rowCount) {
          const prior = (await tx.query<VideoRow>(`${selectVideo} WHERE account_id=$1 AND idempotency_key=$2 AND deleted_at IS NULL FOR UPDATE`, [account, key])).rows[0];
          if (!prior) return new UploadError('not_found', 'Запись не найдена', 404);
          if (prior.failure_reason === 'refused_user_uploads') return quotaError('user_uploads', now);
          if (prior.status !== 'uploading') return new UploadError('conflict', 'Загрузка уже завершена', 409);
          if (!prior.upload_parts?.length || !prior.upload_id) throw new Error('Неполная запись загрузки');
          // Сохраняем тот же ответ, обновляем ссылки только после истечения срока.
          if (Date.parse(prior.upload_parts[0]!.expires_at) <= now.getTime()) {
            prior.upload_parts = await this.storage.sign(prior.object_key, prior.upload_id,
              Math.ceil(Number(prior.declared_bytes) / prior.upload_part_size), now);
            await tx.query('UPDATE video SET upload_parts=$2, updated_at=now() WHERE id=$1', [prior.id, JSON.stringify(prior.upload_parts)]);
          }
          return { video_id: prior.id, upload_id: prior.upload_id, part_size: prior.upload_part_size, parts: prior.upload_parts };
        }
        const quota = await checkAndConsumeQuota(tx, this.limits, account, 'upload', 1, now);
        if (!quota.granted) {
          await tx.query("UPDATE video SET status='failed', failure_reason='refused_user_uploads', finished_at=now() WHERE id=$1", [id]);
          return quotaError(quota.scope, now);
        }
        const ext = body.filename.split('.').pop()?.toLowerCase();
        const objectKey = `videos/${account}/${id}/source.${ext && ['mp4', 'mov', 'webm', 'm4a', 'mp3'].includes(ext) ? ext : 'bin'}`;
        const partSize = calculatePartSize(body.declared_bytes);
        const uploadId = await this.storage.initiate(objectKey);
        initiated = { key: objectKey, id: uploadId };
        const parts = await this.storage.sign(objectKey, uploadId, Math.ceil(body.declared_bytes / partSize), now);
        await tx.query(`UPDATE video SET upload_id=$2, object_key=$3, upload_parts=$4, upload_part_size=$5, updated_at=now() WHERE id=$1`,
          [id, uploadId, objectKey, JSON.stringify(parts), partSize]);
        return { video_id: id, upload_id: uploadId, part_size: partSize, parts };
      });
    } catch (error) {
      // Не оставляем multipart после отката SQL; отказ abort не скрывается.
      if (initiated) await this.storage.abort(initiated.key, initiated.id);
      throw error;
    }
    if (result instanceof UploadError) throw result;
    return result;
  }
  private async failFile(tx: PoolClient, row: VideoRow, reason: 'too_large' | 'not_media', now: Date) {
    await tx.query("UPDATE video SET status='failed', failure_reason=$2, finished_at=now(), updated_at=now() WHERE id=$1", [row.id, reason]);
    await refundUploadSlot(tx, this.limits, row.account_id, row.upload_day, reason, now);
    return { objectKey: row.object_key, uploadId: row.upload_id, error: new UploadError('invalid',
      reason === 'too_large' ? 'Файл больше 2 000 000 000 байт' : 'Файл не является видео или аудио', 422, { reason }) };
  }
  async complete(account: string, input: unknown): Promise<{ video_id: string; status: 'queued' }> {
    const parsed = completeUploadSchema.safeParse(input);
    if (!parsed.success) throw new UploadError('invalid', 'Проверьте идентификатор и список частей', 422);
    const body = parsed.data;
    const outcome = await transaction(this.pool, async (tx) => {
      const row = (await tx.query<VideoRow>(`${selectVideo} WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL FOR UPDATE`, [body.video_id, account])).rows[0];
      if (!row) return new UploadError('not_found', 'Запись не найдена', 404);
      // Повтор после отказа транспорта восстанавливает постановку уже зафиксированной строки.
      if (row.status === 'queued' && !row.upload_enqueued_at) return row.id;
      if (row.status === 'failed' && (row.failure_reason === 'too_large' || row.failure_reason === 'not_media')) {
        return { objectKey: row.object_key, uploadId: row.upload_id, error: new UploadError('invalid',
          row.failure_reason === 'too_large' ? 'Файл больше 2 000 000 000 байт' : 'Файл не является видео или аудио', 422, { reason: row.failure_reason }) };
      }
      if (row.status !== 'uploading') return new UploadError('conflict', 'Загрузка уже завершена', 409);
      if (!row.upload_id || !row.object_key) throw new Error('Неполная запись загрузки');
      const now = this.clock();
      try { await this.storage.complete(row.object_key, row.upload_id, body.parts); }
      catch (error) {
        if (error instanceof UploadTooLarge) {
          return this.failFile(tx, row, 'too_large', now);
        }
        // Ответ Complete мог потеряться после фиксации S3. HEAD позволяет продолжить.
        try { await this.storage.head(row.object_key); }
        catch {
          await this.storage.abort(row.object_key, row.upload_id);
          await tx.query("UPDATE video SET status='failed', failure_reason='stalled', finished_at=now(), updated_at=now() WHERE id=$1", [row.id]);
          return new UploadError('unavailable', 'Хранилище не завершило загрузку. Загрузите файл снова', 503);
        }
      }
      const bytes = await this.storage.head(row.object_key);
      await tx.query('UPDATE video SET actual_bytes=$2 WHERE id=$1', [row.id, bytes]);
      if (bytes > BigInt(MAX_UPLOAD_BYTES)) return this.failFile(tx, row, 'too_large', now);
      if (!isAllowedMedia(await this.storage.bytes(row.object_key))) return this.failFile(tx, row, 'not_media', now);
      await tx.query("UPDATE video SET status='queued', updated_at=now() WHERE id=$1", [row.id]);
      return row.id;
    });
    if (outcome instanceof UploadError) throw outcome;
    if (typeof outcome !== 'string') {
      // failed и возврат уже зафиксированы. Повтор безопасно завершит очистку после сбоя S3.
      await this.storage.abort(outcome.objectKey, outcome.uploadId);
      await this.storage.delete(outcome.objectKey);
      throw outcome.error;
    }
    await this.enqueue(outcome, 1); // Только ПОСЛЕ COMMIT; fence первой стадии.
    await this.pool.query("UPDATE video SET upload_enqueued_at=now() WHERE id=$1 AND status='queued'", [outcome]);
    return { video_id: outcome, status: 'queued' };
  }
}
