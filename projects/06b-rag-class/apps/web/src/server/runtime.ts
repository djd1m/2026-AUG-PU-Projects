// Синглтоны процесса web: конфигурация, два пула, сервис входа. Создаются лениво при первом запросе (сборка Next.js
// импортирует модули маршрутов без окружения); отказ конфигурации при старте делает instrumentation.ts.
// Лимитер и пулы — синглтоны: экземпляр на запрос обходил бы защиту (coding-style.md → Known Gotchas).
//
// Два пула — два пользователя входа (002_rls.sql, 08_review.md F-3):
//   tenantPool  — n6b_app_tenant, только withTenant: кабинет. Стать n6b_service из этого пула нельзя.
//   servicePool — n6b_app_service, только withService: вход, регистрация, сессии, пределы попыток.
// По POOL_MAX соединений на пул: web держит до 2×10, воркер — 10 (Architecture → Scalability).

import bcrypt from 'bcrypt';
import { createIssueHandoverHandler, createAcceptHandoverHandler } from './handover-handler';
import { createPool, type Pool, reserveQuotaNow } from '@n6b/db';
import { createAskHandler } from './ask-handler';
import { AuthService, type PasswordHasher } from './auth';
import { createAuthHandler } from './auth-handler';
import { PgAuthStore } from './auth-store';
import { loadWebConfig, type WebConfig } from './config';
import { createJobHandler, createRetryHandler, createSourceHandler } from './jobs-handler';
import { createPaidRuntime, type PaidRuntime } from './paid';
import { createPublishHandler } from './publish-handler';
import { createWidgetHandler } from './widget-handler';
import { createDemoHandler } from './demo-handler';

const hasher: PasswordHasher = {
  hash: (password, cost) => bcrypt.hash(password, cost),
  compare: (password, hash) => bcrypt.compare(password, hash),
};

interface WebRuntime {
  readonly config: WebConfig;
  readonly tenantPool: Pool;
  readonly servicePool: Pool;
  readonly auth: AuthService;
  /** Единственная дверь к платным вызовам процесса web: резерв → журнал → провайдер live (spend-ceilings). */
  readonly paid: PaidRuntime;
}

let state: WebRuntime | undefined;

export function getRuntime(): WebRuntime {
  if (!state) {
    const config = loadWebConfig();
    const tenantPool = createPool(config.DATABASE_URL_TENANT, 'DATABASE_URL_TENANT');
    const servicePool = createPool(config.DATABASE_URL_SERVICE, 'DATABASE_URL_SERVICE');
    state = { config, tenantPool, servicePool,
      auth: new AuthService(new PgAuthStore(servicePool), hasher, config.SESSION_SECRET),
      paid: createPaidRuntime(config, servicePool) };
  }
  return state;
}

/** Ручки источника и задачи индексации: сессия — служебный пул, данные — пул кабинета под RLS. */
export function jobsRoute(kind: 'source' | 'job' | 'retry') {
  return async (request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> => {
    const { config, tenantPool, auth } = getRuntime();
    const deps = { authenticate: (token: string) => auth.authenticate(token), tenantPool,
      publicBaseUrl: config.PUBLIC_BASE_URL };
    const handler = kind === 'source' ? createSourceHandler(deps) : kind === 'job' ? createJobHandler(deps)
      : createRetryHandler(deps);
    return handler(request, (await context.params).id);
  };
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

export function askRoute(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { config, tenantPool, servicePool, auth, paid } = getRuntime();
  return context.params.then(({ id }) => createAskHandler({ tenantPool, servicePool, gateway: paid.gateway,
    authenticate: (token) => auth.authenticate(token), publicBaseUrl: config.PUBLIC_BASE_URL,
    minSimilarity: config.MIN_SIMILARITY })(request, id));
}

export async function publishRoute(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { config, tenantPool, auth } = getRuntime();
  return createPublishHandler({ tenantPool, authenticate: (token) => auth.authenticate(token),
    publicBaseUrl: config.PUBLIC_BASE_URL })(request, (await context.params).id);
}

export function widgetRoute(kind: 'config' | 'ask' | 'event') {
  return (request: Request): Promise<Response> => {
    const { config, servicePool, paid } = getRuntime();
    return createWidgetHandler(kind, { servicePool, gateway: paid.gateway, publicBaseUrl: config.PUBLIC_BASE_URL,
      visitorSecret: config.VISITOR_SECRET, minSimilarity: config.MIN_SIMILARITY })(request);
  };
}

export async function demoRoute(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { config, servicePool, paid } = getRuntime();
  return createDemoHandler({ servicePool, gateway: paid.gateway, publicBaseUrl: config.PUBLIC_BASE_URL,
    visitorSecret: config.VISITOR_SECRET, minSimilarity: config.MIN_SIMILARITY })(request, (await context.params).slug);
}

export function handoverRoute(kind: 'issue' | 'accept') {
  return async (request: Request, context: { params: Promise<{ id?: string; token?: string }> }): Promise<Response> => {
    const { config, servicePool, auth } = getRuntime();
    const params = await context.params;
    const common = { servicePool, publicBaseUrl: config.PUBLIC_BASE_URL };
    if (kind === 'issue') return createIssueHandoverHandler({ ...common,
      authenticate: (token) => auth.authenticate(token) })(request, params.id ?? '');
    return createAcceptHandoverHandler({ ...common, auth, hasher, visitorSecret: config.VISITOR_SECRET,
      authLimitPerHour: config.LIMIT_AUTH_ADDR_HOUR, production: config.production,
      reserve: (keys) => reserveQuotaNow(servicePool, keys) })(request, params.token ?? '');
  };
}
