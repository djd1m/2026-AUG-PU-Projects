import { renderErrorMessage } from '../src/render/diagnostics';
import { startWorker } from '../src/runtime';
void startWorker('worker-video', { DATABASE_URL: process.env.DATABASE_URL, REDIS_URL: process.env.REDIS_URL,
  N5_PUBLIC_ORIGIN: process.env.N5_PUBLIC_ORIGIN,
  N5_SHORT_CODE_LENGTH: process.env.N5_SHORT_CODE_LENGTH, NODE_ENV: process.env.NODE_ENV,
  N5_WORK_DIR: process.env.N5_WORK_DIR, S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_REGION: process.env.S3_REGION, S3_BUCKET: process.env.S3_BUCKET,
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY, S3_SECRET_KEY: process.env.S3_SECRET_KEY,
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE }).catch((error: unknown) => {
  console.error(`Воркер не запущен: ${renderErrorMessage(error)}`);
  process.exitCode = 1;
});
