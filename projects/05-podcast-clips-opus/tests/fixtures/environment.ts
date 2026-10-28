import { randomBytes } from 'node:crypto';
// Только локальный тест: секрет случаен и не относится ни к одному развёрнутому сервису.
export function environment(): NodeJS.ProcessEnv {
  return {
    N5_MODEL_PROVIDER: 'fake', N5_STT_PROVIDER: 'openrouter', N5_LLM_PROVIDER: 'openrouter', CLOUDRU_FM_API_KEY: 'unused-test-fm-key',
    YANDEX_SPEECHKIT_API_KEY: 'unused-test-yandex-key', OPENROUTER_API_KEY: 'unused-test-key', N5_LLM_MODEL: 'anthropic/claude-sonnet-5',
    S3_ENDPOINT: 'http://minio:9000', S3_PUBLIC_ENDPOINT: 'https://storage.test.invalid', S3_REGION: 'us-east-1', S3_BUCKET: 'n5-test',
    S3_ACCESS_KEY: 'test-key', S3_SECRET_KEY: randomBytes(32).toString('hex'), S3_FORCE_PATH_STYLE: 'true',
    NODE_ENV: 'test', N5_WORK_DIR: '/tmp/n5-test-work', N5_TRUSTED_PROXY_HOPS: '2', N5_LIMIT_USER_MINUTES: '90', N5_LIMIT_PAID_USER_MINUTES: '270', N5_LIMIT_USER_UPLOADS: '2',
    N5_LIMIT_USER_RERENDERS: '20', N5_LIMIT_USER_UPLOAD_REFUNDS: '2', N5_LIMIT_USER_LLM: '2',
    N5_LIMIT_GLOBAL_MINUTES: '600', N5_LIMIT_GLOBAL_LLM: '20',
    N5_METRIKA_COUNTER_ID: '',
    N5_GLOSSARY: '', N5_SHORT_CODE_LENGTH: '6', N5_PUBLIC_ORIGIN: 'https://test.invalid', DATABASE_URL: 'postgresql://test@localhost/test',
    REDIS_URL: 'redis://localhost:6379', SESSION_SECRET: randomBytes(32).toString('hex'),
    // Фича 30: оплата выключена — как на стенде, где N5_PAYMENTS_MODE не задан (compose пробрасывает off).
    N5_MAIL_MODE: 'disabled', N5_RESEND_API_KEY: '', N5_MAIL_FROM: '', N5_SMTP_HOST: '', N5_SMTP_PORT: '', N5_SMTP_USER: '', N5_SMTP_PASSWORD: '', N5_SMTP_SECURE: '',
    N5_MAIL_TEST_CAPTURE_FILE: '', N5_SUPPORT_MODE: 'disabled', N5_SUPPORT_BASE_URL: '', N5_SUPPORT_INBOX_ID: '',
    N5_SUPPORT_IDENTIFIED: 'false', N5_SUPPORT_JWT_SECRET: '', N5_SUPPORT_CONTACT_EMAIL: '',
    N5_BILLING_MODE: 'legacy', N5_PAYMENTS_MODE: 'off', YOOKASSA_SHOP_ID: '', YOOKASSA_SECRET_KEY: '', YOOKASSA_TEST_MODE: '',
  };
}
