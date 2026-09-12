// Оснастка тестов, которым нужен НАСТОЯЩИЙ MinIO профиля `test` (RV-consent-and-telegram-auth-02:
// "интеграционный тест на настоящем MinIO из тестового compose"). Значения — ИЗ ОКРУЖЕНИЯ
// (`docker compose --profile test`, сервис `test` уже объявляет `S3_*`), а не литералы: тест,
// подключающийся к тому же бакету, что и код, обязан читать те же переменные.

import { Client as MinioClient } from 'minio';
import type { StorageConfig } from '@n4/shared';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} не задан: тест настоящего MinIO запускается в профиле test docker compose`);
  }
  return value;
}

export function testStorageConfig(): StorageConfig {
  return {
    endpoint: required('S3_ENDPOINT'),
    bucket: required('S3_BUCKET'),
    accessKey: required('S3_ACCESS_KEY'),
    secretKey: required('S3_SECRET_KEY'),
  };
}

function rawClient(storage: StorageConfig): MinioClient {
  const url = new URL(storage.endpoint);
  const useSSL = url.protocol === 'https:';
  return new MinioClient({
    endPoint: url.hostname,
    port: url.port !== '' ? Number.parseInt(url.port, 10) : useSSL ? 443 : 80,
    useSSL,
    accessKey: storage.accessKey,
    secretKey: storage.secretKey,
  });
}

/** Бакет НЕ создаётся автоматически ничем в compose — тест обязан обеспечить его сам. */
export async function ensureTestBucket(storage: StorageConfig = testStorageConfig()): Promise<void> {
  const client = rawClient(storage);
  const exists = await client.bucketExists(storage.bucket).catch(() => false);
  if (!exists) await client.makeBucket(storage.bucket);
}

export async function uploadTestObject(objectKey: string, body: string, storage: StorageConfig = testStorageConfig()): Promise<void> {
  const client = rawClient(storage);
  await client.putObject(storage.bucket, objectKey, Buffer.from(body, 'utf8'));
}

export async function objectExists(objectKey: string, storage: StorageConfig = testStorageConfig()): Promise<boolean> {
  const client = rawClient(storage);
  try {
    await client.statObject(storage.bucket, objectKey);
    return true;
  } catch {
    return false;
  }
}
