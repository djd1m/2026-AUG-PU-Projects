// Загрузка видео в объектное хранилище (Architecture §5, Pseudocode §1.1
// `uploadToStorage(bucket = "testimonial-videos", file = request.video)`).
//
// MinIO — S3-совместимое API, поэтому AWS SDK v3 с forcePathStyle. Тот же приём, что уже
// применён в services/worker/src/storage.ts; клиент здесь отдельный, потому что apps/web
// ПИШЕТ объекты, а воркер только подписывает GET-ссылки.

import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export const VIDEO_BUCKET = process.env.S3_BUCKET ?? 'testimonial-videos';

/** Инфраструктурный сбой — отдельный тип: Pseudocode §1 отличает его от вины автора (503 + откат квоты). */
export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageError';
  }
}

let cached: S3Client | null = null;

export function s3Client(): S3Client {
  if (cached) return cached;
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) throw new StorageError('S3_ENDPOINT не задан — см. .env.example');
  cached = new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true, // обязательно для MinIO — hosted-style адресация не работает
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    },
  });
  return cached;
}

/** Только для тестов: сбросить закешированный клиент после подмены переменных окружения. */
export function resetS3Client(): void {
  cached = null;
}

const EXT: Record<string, string> = { 'video/webm': 'webm', 'video/mp4': 'mp4' };

/**
 * Ключ объекта — projectId/uuid.ext. Имя файла, присланное автором, НЕ используется:
 * оно управляемо извне и попало бы в путь хранилища (обход каталога, коллизии, утечка
 * имён с личными данными). Префикс projectId делает выборку по арендатору тривиальной.
 */
export function buildObjectKey(projectId: string, mime: string): string {
  return `${projectId}/${randomUUID()}.${EXT[mime] ?? 'bin'}`;
}

export async function uploadVideo(
  projectId: string,
  body: Uint8Array,
  mime: string,
): Promise<string> {
  const objectKey = buildObjectKey(projectId, mime);
  try {
    await s3Client().send(
      new PutObjectCommand({
        Bucket: VIDEO_BUCKET,
        Key: objectKey,
        Body: body,
        ContentType: mime,
      }),
    );
  } catch (cause) {
    throw new StorageError(`не удалось сохранить видео в ${VIDEO_BUCKET}`, { cause });
  }
  // Возвращается КЛЮЧ, не URL: постоянных ссылок на MinIO не существует, presigned
  // выдаются в момент нужды (канон Architecture §10 — video_object_key, НЕ video_url).
  return objectKey;
}
