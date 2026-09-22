import { randomBytes } from 'node:crypto';
// Только локальный тест: секрет случаен и не относится ни к одному развёрнутому сервису.
export function environment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test', N5_TRUSTED_PROXY_HOPS: '2', N5_LIMIT_USER_MINUTES: '90', N5_LIMIT_USER_UPLOADS: '2',
    N5_LIMIT_USER_UPLOAD_REFUNDS: '2', N5_LIMIT_USER_LLM: '2',
    N5_LIMIT_GLOBAL_MINUTES: '600', N5_LIMIT_GLOBAL_LLM: '20',
    N5_PUBLIC_ORIGIN: 'https://test.invalid', DATABASE_URL: 'postgresql://test@localhost/test',
    REDIS_URL: 'redis://localhost:6379', SESSION_SECRET: randomBytes(32).toString('hex'),
  };
}
