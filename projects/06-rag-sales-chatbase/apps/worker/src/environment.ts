// Образец — N5 apps/web/src/server/environment.ts: явное чтение делает проброс проверяемым
// (scripts/check-env-wiring.sh). worker-index не получает SESSION_SECRET (канон §6).
export function readEnvironment() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    N6_PUBLIC_ORIGIN: process.env.N6_PUBLIC_ORIGIN,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    ANSWER_MODEL: process.env.ANSWER_MODEL,
    EMBED_MODEL: process.env.EMBED_MODEL,
    N6_SPEND_LOG: process.env.N6_SPEND_LOG,
    N6_UPLOAD_DIR: process.env.N6_UPLOAD_DIR,
    QUOTA_VISITOR_ANSWERS: process.env.QUOTA_VISITOR_ANSWERS,
    QUOTA_IP_ANSWERS: process.env.QUOTA_IP_ANSWERS,
    QUOTA_BOT_DAY_FREE: process.env.QUOTA_BOT_DAY_FREE,
    QUOTA_BOT_DAY_PAID: process.env.QUOTA_BOT_DAY_PAID,
    QUOTA_BOT_MONTH_FREE: process.env.QUOTA_BOT_MONTH_FREE,
    QUOTA_BOT_MONTH_PAID: process.env.QUOTA_BOT_MONTH_PAID,
    QUOTA_GLOBAL_ANSWERS: process.env.QUOTA_GLOBAL_ANSWERS,
    QUOTA_PREVIEW_SESSION_CREATE: process.env.QUOTA_PREVIEW_SESSION_CREATE,
    QUOTA_PREVIEW_SESSION_ANSWERS: process.env.QUOTA_PREVIEW_SESSION_ANSWERS,
    QUOTA_IP_PREVIEWS: process.env.QUOTA_IP_PREVIEWS,
    QUOTA_GLOBAL_PREVIEWS: process.env.QUOTA_GLOBAL_PREVIEWS,
    QUOTA_GLOBAL_PREVIEW_ANSWERS: process.env.QUOTA_GLOBAL_PREVIEW_ANSWERS,
    QUOTA_ACCOUNT_EMBED: process.env.QUOTA_ACCOUNT_EMBED,
    QUOTA_GLOBAL_EMBED: process.env.QUOTA_GLOBAL_EMBED,
  };
}
