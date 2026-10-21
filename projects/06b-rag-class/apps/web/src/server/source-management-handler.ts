import { deleteSource, recrawlSource, readBotStats } from '@n6b/db';
import type { JobsDeps } from './jobs-handler';
import { readSessionCookie } from './auth-handler';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (status: number, body: object) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });

export function createSourceManagementHandler(kind: 'delete' | 'recrawl' | 'stats', deps: JobsDeps) {
  const origin = new URL(deps.publicBaseUrl).origin;
  return async (request: Request, id: string): Promise<Response> => {
    try {
      if (kind !== 'stats' && request.headers.get('origin') !== origin)
        return fail(403, 'forbidden_origin', 'Источник запроса не разрешён');
      const token = readSessionCookie(request);
      const accountId = token ? await deps.authenticate(token) : null;
      if (!accountId) return fail(401, 'unauthorized', 'Войдите в кабинет');
      if (!UUID.test(id)) return fail(404, 'not_found', 'Не найдено');
      id = id.toLowerCase();
      if (kind === 'delete') {
        const result = await deleteSource(deps.tenantPool, accountId, id);
        if (result === 'source-busy') return fail(409, 'source_busy', 'дождитесь окончания индексации');
        if (result === 'deleted') return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
      } else if (kind === 'recrawl') {
        const job = await recrawlSource(deps.tenantPool, accountId, id);
        if (job) return json(202, { data: { job_id: job.jobId } });
      } else {
        const stats = await readBotStats(deps.tenantPool, accountId, id);
        if (stats) return json(200, { data: stats });
      }
      return fail(404, 'not_found', 'Не найдено');
    } catch (error) {
      (deps.log ?? console.error)(`source-management: ${(error as Error).name}`);
      return fail(503, 'source_unavailable', 'Сервис временно недоступен. Повторите позже');
    }
  };
}
