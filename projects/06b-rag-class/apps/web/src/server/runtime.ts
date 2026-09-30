// Синглтоны процесса web: конфигурация, два пула, сервис входа. Создаются лениво при первом запросе (сборка Next.js
// импортирует модули маршрутов без окружения); отказ конфигурации при старте делает instrumentation.ts.
// Лимитер и пулы — синглтоны: экземпляр на запрос обходил бы защиту (coding-style.md → Known Gotchas).
//
// Два пула — два пользователя входа (002_rls.sql, 08_review.md F-3):
//   tenantPool  — n6b_app_tenant, только withTenant: кабинет. Стать n6b_service из этого пула нельзя.
//   servicePool — n6b_app_service, только withService: вход, регистрация, сессии, пределы попыток.
// По POOL_MAX соединений на пул: web держит до 2×10, воркер — 10 (Architecture → Scalability).

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
  readonly tenantPool: Pool;
  readonly servicePool: Pool;
  readonly auth: AuthService;
}

let state: WebRuntime | undefined;

export function getRuntime(): WebRuntime {
  if (!state) {
    const config = loadWebConfig();
    const tenantPool = createPool(config.DATABASE_URL_TENANT, 'DATABASE_URL_TENANT');
    const servicePool = createPool(config.DATABASE_URL_SERVICE, 'DATABASE_URL_SERVICE');
    state = { config, tenantPool, servicePool,
      auth: new AuthService(new PgAuthStore(servicePool), hasher, config.SESSION_SECRET) };
  }
  return state;
}

export function authRoute(action: 'register' | 'login' | 'logout') {
  return (request: Request): Promise<Response> => {
    const { config, servicePool, auth } = getRuntime();
    return createAuthHandler(action, {
      auth,
      publicBaseUrl: config.PUBLIC_BASE_URL,
      visitorSecret: config.VISITOR_SECRET,
      authLimitPerHour: config.LIMIT_AUTH_ADDR_HOUR,
      production: config.production,
      reserve: (keys) => reserveQuotaNow(servicePool, keys),
    })(request);
  };
}
