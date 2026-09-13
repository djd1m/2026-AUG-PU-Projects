// Хранилище оригинала (FR-scan-pipeline-14/19). Загрузка ДО любой транзакции БД; ключ по
// `device_session_id + '/' + recognition_id + '.' + ext` (PC2-01) — НЕ по хешу содержимого:
// два разных запроса с одинаковым фото и разными `Idempotency-Key` не должны делить объект.

import { Client as MinioClient } from 'minio';
import type { StorageConfig } from '@n4/shared';

const EXT_BY_SIGNATURE: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', heic: 'heic' };
const MIME_BY_SIGNATURE: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

export function extensionFor(signature: string): string {
  return EXT_BY_SIGNATURE[signature] ?? 'bin';
}

export function mimeFor(signature: string): string {
  return MIME_BY_SIGNATURE[signature] ?? 'application/octet-stream';
}

export function objectKeyFor(deviceSessionId: string, recognitionId: string, signature: string): string {
  return `${deviceSessionId}/${recognitionId}.${extensionFor(signature)}`;
}

export interface PhotoStorage {
  ensureBucket(): Promise<void>;
  putOriginal(objectKey: string, buffer: Uint8Array, contentType: string): Promise<void>;
  removeObject(objectKey: string): Promise<void>;
  /** Существование объекта — используется уборкой орфанов (шаг 12) и тестами. */
  exists(objectKey: string): Promise<boolean>;
}

function parseEndpoint(endpoint: string): { host: string; port: number; useSSL: boolean } {
  const url = new URL(endpoint);
  const useSSL = url.protocol === 'https:';
  const port = url.port !== '' ? Number.parseInt(url.port, 10) : useSSL ? 443 : 80;
  return { host: url.hostname, port, useSSL };
}

export function createPhotoStorage(config: StorageConfig): PhotoStorage {
  const { host, port, useSSL } = parseEndpoint(config.endpoint);
  const client = new MinioClient({ endPoint: host, port, useSSL, accessKey: config.accessKey, secretKey: config.secretKey });
  const bucket = config.bucket;

  return {
    async ensureBucket() {
      const exists = await client.bucketExists(bucket).catch(() => false);
      if (!exists) await client.makeBucket(bucket);
    },
    async putOriginal(objectKey, buffer, contentType) {
      await client.putObject(bucket, objectKey, Buffer.from(buffer), buffer.byteLength, { 'Content-Type': contentType });
    },
    async removeObject(objectKey) {
      // Отсутствие объекта — тоже успех (FR-scan-pipeline-11): best-effort-удаление не
      // обязано различать «уже удалён» и «никогда не существовал».
      try {
        await client.removeObject(bucket, objectKey);
      } catch {
        // Молчаливо: удаление объекта откатанной попытки — best-effort по построению
        // (FR-scan-pipeline-14 шаг 9.3), а гарантированный рубеж — уборка орфанов/lifecycle.
      }
    },
    async exists(objectKey) {
      try {
        await client.statObject(bucket, objectKey);
        return true;
      } catch {
        return false;
      }
    },
  };
}
