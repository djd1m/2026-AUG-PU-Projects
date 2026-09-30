// Синглтоны процесса web: конфигурация, пул, сервис входа. Создаются лениво при первом запросе (сборка Next.js
// импортирует модули маршрутов без окружения); отказ конфигурации при старте делает instrumentation.ts.
// Лимитер и пул — синглтоны: экземпляр на запрос обходил бы защиту (coding-style.md → Known Gotchas).

import bcrypt from 'bcrypt';
import { createPool, type Pool, reserveQuotaNow } from '@n6b/db';
import { AuthService, type PasswordHasher } from './auth';
import { createAuthHandler } from './auth-handler';
import { PgAuthStore } from './auth-store';
import { loadWebConfig, type WebConfig } from './config';

const hasher: PasswordHasher = {
  hash: (password, cost) => bcrypt.hash(password, cost),
  compare: (password, hash) => bcrypt.compare(password, hash),
};

interface WebRuntime {
  readonly config: WebConfig;
  readonly pool: Pool;
  readonly auth: AuthService;
}

let state: WebRuntime | undefined;

export function getRuntime(): WebRuntime {
  if (!state) {
    const config = loadWebConfig();
    const pool = createPool(process.env.DATABASE_URL ?? '');
    state = { config, pool, auth: new AuthService(new PgAuthStore(pool), hasher, config.SESSION_SECRET) };
  }
  return state;
}

export function authRoute(action: 'register' | 'login' | 'logout') {
  return (request: Request): Promise<Response> => {
    const { config, pool, auth } = getRuntime();
    return createAuthHandler(action, {
      auth,
      publicBaseUrl: config.PUBLIC_BASE_URL,
      visitorSecret: config.VISITOR_SECRET,
      authLimitPerHour: config.LIMIT_AUTH_ADDR_HOUR,
      production: config.production,
      reserve: (keys) => reserveQuotaNow(pool, keys),
    })(request);
  };
}
