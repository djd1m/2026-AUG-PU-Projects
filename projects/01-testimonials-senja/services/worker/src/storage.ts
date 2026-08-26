/**
 * services/worker/src/storage.ts
 *
 * Presigned GET URL из `video_object_key` (Architecture §5, шаг 3): "Worker формирует
 * presigned GET URL ИЗ video_object_key" — не из video_url, такого поля в схеме нет
 * (канон Architecture §10: `video_object_key`, "НЕ video_url" — постоянная ссылка на
 * MinIO не хранится нигде, она истекает и живёт только на время вызова mcp-claude).
 *
 * MinIO — S3-совместимое API (Architecture §5), поэтому используем официальный AWS
 * SDK v3 с `forcePathStyle: true` и кастомным `endpoint` — стандартный способ
 * подключения AWS SDK к MinIO, отдельный MinIO-клиент не нужен.
 */

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { WorkerConfig } from "./config.js";

export function createS3Client(config: WorkerConfig): S3Client {
  return new S3Client({
    endpoint: config.s3Endpoint,
    region: config.s3Region,
    forcePathStyle: true, // обязательно для MinIO — виртуальный hosted-style не работает
    credentials: {
      accessKeyId: config.s3AccessKey,
      secretAccessKey: config.s3SecretKey,
    },
  });
}

/**
 * Presigned URL живёт ровно `ttlSeconds` (по умолчанию 10 минут — Pseudocode §1.1) и
 * НИКОГДА не пишется в БД (Architecture §5: "presigned ссылки недолговечны и выдаются
 * отдельно в момент рендера/скачивания").
 */
export async function generatePresignedGetUrl(
  s3: S3Client,
  bucket: string,
  objectKey: string,
  ttlSeconds: number,
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: objectKey });
  return getSignedUrl(s3, command, { expiresIn: ttlSeconds });
}
