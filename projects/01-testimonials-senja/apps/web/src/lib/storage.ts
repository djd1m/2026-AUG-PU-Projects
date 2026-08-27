// Загрузка видео в объектное хранилище (Architecture §5, Pseudocode §1.1
// `uploadToStorage(bucket = "testimonial-videos", file = request.video)`).
//
// MinIO — S3-совместимое API, поэтому AWS SDK v3 с forcePathStyle. Тот же приём, что уже
// применён в services/worker/src/storage.ts; клиент здесь отдельный, потому что apps/web
// ПИШЕТ объекты, а воркер только подписывает GET-ссылки.

import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export const VIDEO_BUCKET = process.env.S3_BUCKET ?? 'testimonial-videos';

/**
 * Фото лежат в ОТДЕЛЬНОМ бакете, а не рядом с видео. Причина не в аккуратности:
 * у них разный режим доступа. Видео отдаётся только по presigned-ссылке в момент
 * обработки, фото — публично, через наш роут, каждому посетителю витрины. Смешав их
 * в одном бакете, однажды получишь общую политику на оба.
 */
export const PHOTO_BUCKET = process.env.S3_PHOTO_BUCKET ?? 'testimonial-photos';

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

const EXT: Record<string, string> = {
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

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

/**
 * Загрузка фото. Content-Type пишется тот, что МЫ определили по сигнатуре, а не тот,
 * что прислал клиент: иначе объект в хранилище уже несёт чужой тип, и роут отдачи
 * унаследует его, даже если сам проверяет содержимое.
 */
export async function uploadPhoto(
  projectId: string,
  body: Uint8Array,
  mime: string,
): Promise<string> {
  const objectKey = buildObjectKey(projectId, mime);
  try {
    await s3Client().send(
      new PutObjectCommand({
        Bucket: PHOTO_BUCKET,
        Key: objectKey,
        Body: body,
        ContentType: mime,
        // Ни при каких условиях не как вложение-документ: браузер не должен
        // предлагать «скачать и открыть» файл, пришедший от постороннего.
        ContentDisposition: 'inline',
      }),
    );
  } catch (cause) {
    throw new StorageError(`не удалось сохранить фото в ${PHOTO_BUCKET}`, { cause });
  }
  return objectKey;
}

/** Читает фото из хранилища для отдачи через наш роут. null — объекта нет. */
export async function readPhoto(objectKey: string): Promise<Uint8Array | null> {
  try {
    const res = await s3Client().send(
      new GetObjectCommand({ Bucket: PHOTO_BUCKET, Key: objectKey }),
    );
    if (!res.Body) return null;
    return new Uint8Array(await res.Body.transformToByteArray());
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === 'NoSuchKey' || name === 'NotFound') return null;
    throw new StorageError(`не удалось прочитать фото ${objectKey}`, { cause: err });
  }
}
