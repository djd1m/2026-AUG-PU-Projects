// Клиент приватного бакета со стороны `recognizer`: чтение оригинала, запись нормализованной
// копии (FR-scan-pipeline-5). Соединение с базой на время этих операций НЕ удерживается —
// аренда закрывает транзакцию ДО первого обращения к хранилищу (`lease.ts`).

import { Client as MinioClient } from 'minio';
import type { StorageConfig } from '@n4/shared';

export interface RecognizerStorage {
  getObject(objectKey: string): Promise<Buffer>;
  putNormalized(objectKey: string, buffer: Buffer): Promise<void>;
}

function parseEndpoint(endpoint: string): { host: string; port: number; useSSL: boolean } {
  const url = new URL(endpoint);
  const useSSL = url.protocol === 'https:';
  const port = url.port !== '' ? Number.parseInt(url.port, 10) : useSSL ? 443 : 80;
  return { host: url.hostname, port, useSSL };
}

export function createRecognizerStorage(config: StorageConfig): RecognizerStorage {
  const { host, port, useSSL } = parseEndpoint(config.endpoint);
  const client = new MinioClient({ endPoint: host, port, useSSL, accessKey: config.accessKey, secretKey: config.secretKey });
  const bucket = config.bucket;

  return {
    async getObject(objectKey) {
      const stream = await client.getObject(bucket, objectKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks);
    },
    async putNormalized(objectKey, buffer) {
      await client.putObject(bucket, objectKey, buffer, buffer.byteLength, { 'Content-Type': 'image/jpeg' });
    },
  };
}

export function normalizedObjectKeyFor(objectKey: string): string {
  const dot = objectKey.lastIndexOf('.');
  const base = dot === -1 ? objectKey : objectKey.slice(0, dot);
  return `${base}.normalized.jpg`;
}
