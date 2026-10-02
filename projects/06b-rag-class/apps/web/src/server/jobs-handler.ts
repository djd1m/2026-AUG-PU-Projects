// Ручки источника и задачи индексации (API Contracts: POST /api/bots/{id}/sources, GET /api/jobs/{job_id},
// POST /api/jobs/{job_id}/retry; long-running-job.md). Порядок (security-operation-order.md):
//   1) POST: Origin ≠ наш или отсутствует → 403 (чужая страница не ставит задачи от имени владельца);
//   2) сессия → 401; идентификатор не uuid → 404 (как чужой: существование не раскрывается);
//   3) тело и URL → 422; 4) запись под RLS (withTenant) → 202 {job_id} ДО начала работы: работу берёт воркер.
// Ответ на создание — идентификатор, никогда не результат: работа длиннее окна прокси (60 с) по построению.

import { enqueueSiteSource, normalizeSiteUrl, type Pool, readJob, retryJob, withTenant } from '@n6b/db';
import { type SiteResolver, UnsafeSite, validateSite } from '@n6b/rag';
import { readJson, readSessionCookie } from './auth-handler';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface JobsDeps {
  readonly authenticate: (token: string) => Promise<string | null>;
  readonly tenantPool: Pool;
  readonly publicBaseUrl: string;
  readonly resolver?: SiteResolver;
  readonly log?: (line: string) => void;
}

const json = (status: number, body: object) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });
const NOT_FOUND = () => fail(404, 'not_found', 'Не найдено');

type Handler = (request: Request, id: string) => Promise<Response>;

function guarded(deps: JobsDeps, what: string, needOrigin: boolean,
  body: (accountId: string, request: Request, id: string) => Promise<Response>): Handler {
  const ownOrigin = new URL(deps.publicBaseUrl).origin;
  return async (request, id) => {
    try {
      if (needOrigin && request.headers.get('origin') !== ownOrigin) {
        return fail(403, 'forbidden_origin', 'Источник запроса не разрешён');
      }
      const token = readSessionCookie(request);
      const accountId = token ? await deps.authenticate(token) : null;
      if (!accountId) return fail(401, 'unauthorized', 'Войдите в кабинет');
      if (typeof id !== 'string' || !UUID_RE.test(id)) return NOT_FOUND();
      return await body(accountId, request, id.toLowerCase());
    } catch (error) {
      (deps.log ?? console.error)(`jobs: ${what} не выполнен: ${(error as Error).name}`);
      return fail(503, 'jobs_unavailable', 'Сервис временно недоступен. Повторите позже');
    }
  };
}

/** POST /api/bots/{id}/sources {url} → 202 {job_id}; повтор, пока задача жива, — тот же job_id (SC-US-004-4). */
export function createSourceHandler(deps: JobsDeps): Handler {
  return guarded(deps, 'источник', true, async (accountId, request, botId) => {
    const body = await readJson(request);
    if (body === 'too-large') return fail(413, 'body_too_large', 'Тело запроса слишком велико');
    const url = normalizeSiteUrl(body !== 'invalid' && typeof body === 'object' && body !== null
      ? (body as { url?: unknown }).url : undefined);
    if (!url) return fail(422, 'invalid_url', 'Укажите адрес сайта http(s):// без логина и пароля, порт 80 или 443');
    const visible = await withTenant(deps.tenantPool, accountId, async (c) =>
      (await c.query('SELECT 1 FROM bot WHERE id = $1', [botId])).rowCount === 1);
    if (!visible) return NOT_FOUND();
    try { await validateSite(url, deps.resolver); }
    catch (error) { if (error instanceof UnsafeSite) return fail(422, 'unsafe_url', error.message); throw error; }
    const job = await enqueueSiteSource(deps.tenantPool, accountId, botId, url);
    if (!job) return NOT_FOUND();
    return json(202, { data: { job_id: job.jobId } });
  });
}

/** GET /api/jobs/{job_id} → три состояния (running | succeeded | failed) и прогресс. Чужая задача → 404. */
export function createJobHandler(deps: JobsDeps): Handler {
  return guarded(deps, 'чтение задачи', false, async (accountId, _request, jobId) => {
    const job = await readJob(deps.tenantPool, accountId, jobId);
    return job ? json(200, { data: job }) : NOT_FOUND();
  });
}

/** POST /api/jobs/{job_id}/retry → 202 с ТЕМ ЖЕ job_id; живую или готовую задачу — 409. */
export function createRetryHandler(deps: JobsDeps): Handler {
  return guarded(deps, 'повтор задачи', true, async (accountId, _request, jobId) => {
    const result = await retryJob(deps.tenantPool, accountId, jobId);
    switch (result) {
      case 'retried': return json(202, { data: { job_id: jobId } });
      case 'not-found': return NOT_FOUND();
      case 'not-failed': return fail(409, 'job_not_failed', 'Повторить можно только задачу с ошибкой');
      case 'source-busy': return fail(409, 'source_busy', 'По этому источнику уже идёт индексация');
    }
  });
}
