// из N5: projects/05-podcast-clips-opus/tests/fixtures/environment.ts — переменные N6, значения канона §7
import { randomBytes } from 'node:crypto';
// Только локальный тест: секреты случайны и не относятся ни к одному развёрнутому сервису.
export function environment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test', N6_PUBLIC_ORIGIN: 'https://sufler.test.invalid',
    DATABASE_URL: 'postgresql://test@localhost/n6_test', REDIS_URL: 'redis://:test-password@localhost:6379',
    SESSION_SECRET: randomBytes(32).toString('hex'), OPENROUTER_API_KEY: 'unused-test-key',
    ANSWER_MODEL: 'anthropic/claude-haiku-4.5', EMBED_MODEL: 'openai/text-embedding-3-small',
    QUOTA_VISITOR_ANSWERS: '20', QUOTA_IP_ANSWERS: '60', QUOTA_BOT_DAY_FREE: '50', QUOTA_BOT_DAY_PAID: '300',
    QUOTA_BOT_MONTH_FREE: '300', QUOTA_BOT_MONTH_PAID: '3000', QUOTA_GLOBAL_ANSWERS: '3000',
    QUOTA_PREVIEW_SESSION_CREATE: '1', QUOTA_PREVIEW_SESSION_ANSWERS: '10', QUOTA_IP_PREVIEWS: '3',
    QUOTA_GLOBAL_PREVIEWS: '200', QUOTA_GLOBAL_PREVIEW_ANSWERS: '1000', QUOTA_ACCOUNT_EMBED: '2000000',
    QUOTA_GLOBAL_EMBED: '20000000',
  };
}
