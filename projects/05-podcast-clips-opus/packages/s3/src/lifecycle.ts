import { GetBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';
import { FAST_REQUEST_TIMEOUT_MS, type StorageContext } from './client.js';

// CreateMultipartUpload может создать загрузку и потерять ответ вместе с UploadId.
// Abort без UploadId невозможен. До создания проверяем серверную страховку сирот.
// Только правило на весь бакет: фильтры по тегам/размеру не доказывают покрытие multipart.
export async function assertMultipartLifecycle(ctx: StorageContext): Promise<void> {
  const result = await ctx.client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: ctx.bucket }),
    { requestTimeout: FAST_REQUEST_TIMEOUT_MS });
  const covered = result.Rules?.some((rule) => rule.Status === 'Enabled'
    && rule.AbortIncompleteMultipartUpload?.DaysAfterInitiation === 1
    && (!rule.Prefix || rule.Prefix === '')
    && (!rule.Filter || Object.keys(rule.Filter).length === 0
      || (Object.keys(rule.Filter).length === 1 && rule.Filter.Prefix === '')));
  if (!covered) throw new Error('S3: требуется lifecycle AbortIncompleteMultipartUpload через 1 день на весь бакет');
}
