import { randomBytes } from 'node:crypto';
import { normalizeSiteUrl, withTenant } from '@n6b/db';
import { UnsafeSite, validateSite } from '@n6b/rag';
import { readJson, readSessionCookie } from './auth-handler';
import { type JobsDeps } from './jobs-handler';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createBotHandler(deps: JobsDeps): (request: Request) => Promise<Response> {
  const fail = (status: number, message: string) => Response.json({ error: { code: 'create_bot_failed', message } }, { status });
  return async (request) => {
    if (request.headers.get('origin') !== new URL(deps.publicBaseUrl).origin) return fail(403, 'Источник запроса не разрешён');
    const token = readSessionCookie(request);
    const accountId = token ? await deps.authenticate(token) : null;
    if (!accountId) return fail(401, 'Войдите в кабинет');
    const raw = await readJson(request);
    if (raw === 'too-large') return fail(413, 'Тело запроса слишком велико');
    if (!raw || typeof raw !== 'object') return fail(422, 'Укажите имя и адрес сайта');
    const body = raw as { name?: unknown; site_url?: unknown; account_id?: unknown };
    if (body.account_id !== undefined && (typeof body.account_id !== 'string' || !UUID.test(body.account_id))) {
      return fail(404, 'Не найдено');
    }
    const targetId = typeof body.account_id === 'string' ? body.account_id.toLowerCase() : accountId;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 200) return fail(422, 'Имя должно содержать от 1 до 200 символов');
    const site = body.site_url === undefined ? null : normalizeSiteUrl(body.site_url);
    if (body.site_url !== undefined && !site) return fail(422, 'Укажите адрес сайта http(s)://');
    try {
      if (site) await validateSite(site, deps.resolver);
      const data = await withTenant(deps.tenantPool, accountId, async (c) => {
        // The session stays the actor. The selected owner must be visible in this insertion transaction.
        const target = (await c.query<{ id: string }>('SELECT id FROM account WHERE id = $1', [targetId])).rows[0];
        if (!target) return null;
        const bot = (await c.query<{ id: string; public_id: string }>(
          'INSERT INTO bot (account_id, public_id, name) VALUES ($1, $2, $3) RETURNING id, public_id',
          [target.id, randomBytes(9).toString('base64url'), name])).rows[0]!;
        if (!site) return { bot_id: bot.id, public_id: bot.public_id };
        const source = (await c.query<{ id: string }>(
          "INSERT INTO source (bot_id, account_id, kind, url) VALUES ($1, $2, 'site', $3) RETURNING id",
          [bot.id, target.id, site])).rows[0]!;
        const job = (await c.query<{ id: string }>('INSERT INTO index_job (source_id, account_id) VALUES ($1, $2) RETURNING id',
          [source.id, target.id])).rows[0]!;
        return { bot_id: bot.id, public_id: bot.public_id, job_id: job.id };
      });
      if (!data) return fail(404, 'Не найдено');
      return Response.json({ data }, { status: site ? 202 : 201, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof UnsafeSite) return fail(422, error.message);
      (deps.log ?? console.error)(`bots: ${(error as Error).name}`);
      return fail(503, 'Сервис временно недоступен. Повторите позже');
    }
  };
}
