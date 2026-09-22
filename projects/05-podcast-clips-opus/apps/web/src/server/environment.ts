// Явное чтение делает проброс окружения проверяемым по графу импортов сервиса.
export function readEnvironment() {
  return {
    NODE_ENV: process.env.NODE_ENV,
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
