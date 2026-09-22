// Адаптировано из .reference/jan-clone/packages/s3/src/client.ts.
import { S3Client } from '@aws-sdk/client-s3';
import type { S3Config } from '@clipmaker/shared/config';
function clientOptions(config: S3Config) {
  return { endpoint: config.endpoint, region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: config.forcePathStyle,
    requestChecksumCalculation: 'WHEN_REQUIRED' as const, responseChecksumValidation: 'WHEN_REQUIRED' as const,
    maxAttempts: 3,
    // Длительность запроса выбирает команда, а не общий клиент.
    requestHandler: { connectionTimeout: 2000, throwOnRequestTimeout: true },
  };
}
// Сохраняет внутренний транспорт и владеет отдельным клиентом публичной подписи.
export class StorageClient extends S3Client {
  readonly signingClient: S3Client | undefined;
  constructor(config: S3Config & { publicEndpoint?: string }) {
    super(clientOptions(config));
    this.signingClient = config.publicEndpoint === undefined ? undefined
      : new S3Client(clientOptions({ ...config, endpoint: config.publicEndpoint }));
  }
  override destroy(): void {
    this.signingClient?.destroy();
    super.destroy();
  }
}
export function createS3Client(config: S3Config & { publicEndpoint?: string }): StorageClient {
  return new StorageClient(config);
}
export interface StorageContext { client: S3Client & { readonly signingClient?: S3Client }; bucket: string }
export function publicSigningClient(ctx: StorageContext): S3Client {
  if (!ctx.client.signingClient) throw new Error('S3_PUBLIC_ENDPOINT отсутствует: браузерные ссылки нельзя подписывать внутренним адресом');
  return ctx.client.signingClient;
}
export const FAST_REQUEST_TIMEOUT_MS = 5000;
