// Адаптировано из .reference/jan-clone/packages/s3/src/client.ts.
import { S3Client } from '@aws-sdk/client-s3';
import type { S3Config } from '@clipmaker/shared/config';
export function createS3Client(config: S3Config): S3Client {
  return new S3Client({ endpoint: config.endpoint, region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: config.forcePathStyle,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 3,
    // Длительность запроса выбирает команда, а не общий клиент.
    requestHandler: { connectionTimeout: 2000, throwOnRequestTimeout: true },
  });
}
export interface StorageContext { client: S3Client; bucket: string }
export const FAST_REQUEST_TIMEOUT_MS = 5000;
