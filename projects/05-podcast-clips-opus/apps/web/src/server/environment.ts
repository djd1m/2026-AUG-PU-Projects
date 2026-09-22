// Явное чтение делает проброс окружения проверяемым по графу импортов сервиса.
export function readEnvironment() {
  return {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
    S3_SECRET_KEY: process.env.S3_SECRET_KEY,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
    NODE_ENV: process.env.NODE_ENV,
    N5_TRUSTED_PROXY_HOPS: process.env.N5_TRUSTED_PROXY_HOPS,
    N5_LIMIT_USER_MINUTES: process.env.N5_LIMIT_USER_MINUTES,
    N5_LIMIT_USER_UPLOADS: process.env.N5_LIMIT_USER_UPLOADS,
    N5_LIMIT_USER_UPLOAD_REFUNDS: process.env.N5_LIMIT_USER_UPLOAD_REFUNDS,
    N5_LIMIT_USER_LLM: process.env.N5_LIMIT_USER_LLM,
    N5_LIMIT_GLOBAL_MINUTES: process.env.N5_LIMIT_GLOBAL_MINUTES,
    N5_LIMIT_GLOBAL_LLM: process.env.N5_LIMIT_GLOBAL_LLM,
    N5_PUBLIC_ORIGIN: process.env.N5_PUBLIC_ORIGIN,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };
}
