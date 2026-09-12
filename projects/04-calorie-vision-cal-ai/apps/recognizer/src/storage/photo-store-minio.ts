// MinioPhotoStore — реализация `PhotoStorePort` на настоящем MinIO/S3-совместимом бакете.
//
// Правка по review-report.md RV-consent-and-telegram-auth-02: `NOOP_PHOTO_STORE` в рабочем
// процессе НЕДОПУСТИМ — фотографии физически оставались в бакете, хотя БД объявляла их
// `purged`, а аккаунт `erased`. Это единственная реализация, подключаемая в `bootstrap.ts`
// (`NOOP_PHOTO_STORE` остаётся ТОЛЬКО тестовой/резервной заглушкой, экспортированной из
// `erasure-job.ts` для юнит-тестов, которым настоящий бакет не нужен).
//
// Отсутствие объекта — тоже успех (как `PurgeExpiredPhotos`): цель — отсутствие файла, а не
// факт удаления. `removeObject` MinIO не бросает исключение на отсутствующем ключе, поэтому
// дополнительная проверка `statObject` перед удалением не нужна и добавила бы лишний вызов.

import { Client as MinioClient } from 'minio';
import type { StorageConfig } from '@n4/shared';
import type { PhotoStorePort } from '../consent/erasure-job.js';

/** Разбирает `http://storage:9000` на компоненты, которых просит конструктор `minio.Client`. */
function parseEndpoint(endpoint: string): { readonly endPoint: string; readonly port: number; readonly useSSL: boolean } {
  const url = new URL(endpoint);
  const useSSL = url.protocol === 'https:';
  const port = url.port !== '' ? Number.parseInt(url.port, 10) : useSSL ? 443 : 80;
  return { endPoint: url.hostname, port, useSSL };
}

export interface MinioPhotoStoreOptions {
  readonly storage: StorageConfig;
}

export function createMinioPhotoStore(options: MinioPhotoStoreOptions): PhotoStorePort {
  const { endPoint, port, useSSL } = parseEndpoint(options.storage.endpoint);
  const client = new MinioClient({
    endPoint,
    port,
    useSSL,
    accessKey: options.storage.accessKey,
    secretKey: options.storage.secretKey,
  });
  const bucket = options.storage.bucket;

  return {
    async purgeObject(objectKey: string): Promise<void> {
      // `removeObject` на отсутствующем ключе НЕ бросает — MinIO трактует удаление
      // несуществующего объекта как успех (идемпотентно по построению самого API).
      await client.removeObject(bucket, objectKey);
    },
  };
}
