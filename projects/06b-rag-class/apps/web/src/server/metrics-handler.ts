import { createHmac, timingSafeEqual } from 'node:crypto';
import { acquireMetricBatch, isMetricOperator, type Pool } from '@n6b/db';
import type { SiteFetch } from '@n6b/rag';
import { readSessionCookie } from './auth-handler';
import { metricInstallEligible, verifyMetricBatch } from './metrics-verifier';

const CURSOR_COOKIE = 'n6b_metric_cursor';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function metricCursor(id: string, actor: string, secret: string): string {
  return `${id}.${createHmac('sha256', secret).update(`metric-cursor:${actor}:${id}`).digest('hex')}`;
}
export function readMetricCursor(raw: string | null, actor: string, secret: string): string | null {
  if (!raw || raw.length !== 101) return null;
  const id = raw.slice(0, 36);
  if (!UUID.test(id)) return null;
  const expected = Buffer.from(metricCursor(id, actor, secret));
  const received = Buffer.from(raw);
  return received.length === expected.length && timingSafeEqual(received, expected) ? id : null;
}

export interface MetricHandlerDeps {
  servicePool: Pool;
  publicBaseUrl: string;
  cursorSecret: string;
  authenticate: (token: string) => Promise<string | null>;
  after: (callback: () => Promise<void>) => void;
  fetchPage?: SiteFetch;
  log?: (line: string) => void;
}
const json = (status: number, data: unknown) => Response.json(data,
  { status, headers: { 'Cache-Control': 'private, no-store' } });

export function createMetricVerifyHandler(deps: MetricHandlerDeps) {
  if (!deps.cursorSecret) throw new Error('SESSION_SECRET missing for metric cursor');
  return async (request: Request): Promise<Response> => {
    try {
      const token = readSessionCookie(request);
      const actor = token ? await deps.authenticate(token) : null;
      if (!actor || !await isMetricOperator(deps.servicePool, actor)) return json(404, { error: { code: 'not_found' } });
      if (request.headers.get('origin') !== new URL(deps.publicBaseUrl).origin) {
        return json(403, { error: { code: 'forbidden_origin' } });
      }
      const cookie = request.headers.get('cookie')?.split(';').map((p) => p.trim())
        .find((p) => p.startsWith(`${CURSOR_COOKIE}=`))?.slice(CURSOR_COOKIE.length + 1) ?? null;
      const result = await acquireMetricBatch(deps.servicePool, actor,
        readMetricCursor(cookie, actor, deps.cursorSecret), (row) => metricInstallEligible(row, deps.publicBaseUrl));
      if (result.kind === 'unauthorized') return json(404, { error: { code: 'not_found' } });
      if (result.kind === 'busy') return json(409, { error: { code: 'verification_busy' } });
      const { batch } = result;
      try {
        deps.after(async () => {
          try {
            await verifyMetricBatch(batch, deps.publicBaseUrl,
              async () => await deps.authenticate(token!) === actor, deps.fetchPage);
          } catch (error) { (deps.log ?? console.error)(`metric-verification: ${(error as Error).name}`); }
        });
      } catch (error) {
        await batch.finish(false);
        throw error;
      }
      const response = json(202, { data: { started: true, selected: batch.rows.length,
        message: 'Проверка запущена. Обновите метрики после её завершения.' } });
      const next = batch.nextId ? metricCursor(batch.nextId, actor, deps.cursorSecret) : '';
      response.headers.set('Set-Cookie', `${CURSOR_COOKIE}=${next}; Path=/admin/metrics; HttpOnly; SameSite=Strict; `
        + `Max-Age=${next ? 86400 : 0}${new URL(deps.publicBaseUrl).protocol === 'https:' ? '; Secure' : ''}`);
      return response;
    } catch (error) {
      (deps.log ?? console.error)(`metric-start: ${(error as Error).name}`);
      return json(503, { error: { code: 'verification_unavailable' } });
    }
  };
}
