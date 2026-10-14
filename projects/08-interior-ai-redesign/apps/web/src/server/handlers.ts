import { DomainError, safeInteger } from '@n8/domain/common';
import { credentialsSchema, projectCreateSchema, projectPatchSchema } from '@n8/domain/identity';
import { getBase, type Base } from './composition';
import { guardRequest, readJson, route, success, readSessionCookie, sessionCookie } from './http';
import { checkReady } from './health';
import {validShareArrival} from './sharing.js';
import {createSharingRepository} from '@n8/db/sharing';
type Factory = () => Base;
export function authHandler(action: 'register' | 'login' | 'logout', factory: Factory = getBase) {
  return route(async (request, requestId) => {
    const base = factory();
    await guardRequest(request, { access: action === 'logout' ? 'mutation' : 'auth' }, base, requestId);
    if (action === 'logout') {
      await base.auth.logout(readSessionCookie(request)!);
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'Set-Cookie': sessionCookie('', base.config.publicOrigin, 0), 'X-Request-Id': requestId } });
    }
    const parsed = credentialsSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new DomainError(422, 'INVALID_CREDENTIALS', 'Укажите корректную почту и пароль от 12 символов до 72 байт UTF-8');
    const token = await base.auth[action](parsed.data.email, parsed.data.password);
    return success({ ok: true }, requestId, action === 'register' ? 201 : 200, undefined, { 'Set-Cookie': sessionCookie(token, base.config.publicOrigin) });
  });
}
export function projectsHandler(method: 'GET' | 'POST', factory: Factory = getBase) {
  return route(async (request, requestId) => {
    const base = factory(); const actor = await guardRequest(request, { access: method === 'GET' ? 'read' : 'mutation' }, base, requestId);
    if (method === 'GET') {
      const query = new URL(request.url).searchParams;
      if ([...query.keys()].some(key => key !== 'limit' && key !== 'cursor') || query.getAll('limit').length > 1 || query.getAll('cursor').length > 1) throw new DomainError(400, 'INVALID_QUERY', 'Некорректный запрос');
      const rawLimit = query.get('limit');
      if (rawLimit !== null && !/^[1-9][0-9]*$/.test(rawLimit)) throw new DomainError(400, 'INVALID_LIMIT', 'Размер страницы от 1 до 50');
      return success(await base.projects.list(actor.accountId, rawLimit === null ? 50 : Number(rawLimit), query.get('cursor') ?? undefined), requestId);
    }
    const parsed = projectCreateSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new DomainError(422, 'INVALID_PROJECT', 'Укажите название и регион');
    const project = await base.projects.create(actor.accountId, parsed.data);
    const arrival=validShareArrival(request,base.config.sessionSecret);
    if(arrival){try{await createSharingRepository(base.pool).newProjectFromShare(actor.accountId,project.id,requestId);}catch{console.error(JSON.stringify({requestId,code:'GROWTH_WRITE_FAILED',latencyMs:0}));}}
    return success(project, requestId, 201, project.version,arrival?{'Set-Cookie':`n8_share_arrival=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${base.config.publicOrigin.startsWith('https:')?'; Secure':''}`} :undefined);
  });
}
export function projectHandler(method: 'GET' | 'PATCH', projectId: string, factory: Factory = getBase) {
  return route(async (request, requestId) => {
    const base = factory(); const actor = await guardRequest(request, { access: method === 'GET' ? 'read' : 'mutation', projectId, expectedVersion: method === 'PATCH' }, base, requestId);
    if (method === 'GET') { const project = await base.projects.get(actor.accountId, projectId); return success(project, requestId, 200, project.version); }
    const parsed = projectPatchSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new DomainError(422, 'INVALID_PROJECT', 'Некорректное изменение проекта');
    const project = await base.projects.update(actor.accountId, projectId, actor.expectedVersion!, parsed.data);
    return success(project, requestId, 200, project.version);
  });
}
export function meHandler(factory: Factory = getBase) {
  return route(async (request, requestId) => {
    const base = factory(); const actor = await guardRequest(request, { access: 'read' }, base, requestId);
    const result = await base.pool.query<{ id: string; email_canonical: string; credits_available: number; credits_held: number; paid_export: boolean; billing_hold: boolean }>(
      "SELECT id,email_canonical,credits_available,credits_held,paid_export,billing_hold FROM account WHERE id=$1 AND status='active'", [actor.accountId]);
    const account = result.rows[0]; if (!account) throw new DomainError(401, 'UNAUTHENTICATED', 'Войдите в аккаунт');
    const usage = await base.pool.query<{ admissions: string; known: string; unknown: string }>(`SELECT
      count(*) FILTER(WHERE admission_day=(now() AT TIME ZONE 'UTC')::date)::text admissions,
      COALESCE(sum(actual_micro_usd),0)::text known,count(*) FILTER(WHERE actual_micro_usd IS NULL AND request_dispatched_at IS NOT NULL)::text unknown
      FROM job WHERE account_id=$1 AND mode='live'`, [actor.accountId]);
    const ledger = await base.pool.query<{ reserved: string }>("SELECT COALESCE(sum(reserved_micro_usd),0)::text reserved FROM spend_budget WHERE scope='account' AND account_id=$1", [actor.accountId]);
    return success({ id: account.id, email: account.email_canonical, creditsAvailable: safeInteger(account.credits_available), creditsHeld: safeInteger(account.credits_held),
      paidExport: account.paid_export, billingHold: account.billing_hold, aiMode: base.config.aiMode, paymentsMode: base.config.paymentsMode,
      aiUsage: { admissionsToday: safeInteger(usage.rows[0].admissions), admissionsLimit: 5, reservedMicroUsd: safeInteger(ledger.rows[0].reserved),
        knownMicroUsd: safeInteger(usage.rows[0].known), unknownOutcomes: safeInteger(usage.rows[0].unknown),
        jobCapMicroUsd: base.config.aiLive?.jobCapMicroUsd ?? null, accountDayCapMicroUsd: base.config.aiLive?.accountDayCapMicroUsd ?? null } }, requestId);
  });
}
export function readyHandler(factory: Factory = getBase) {
  return route(async (_request, requestId) => { const ready = await checkReady(factory()); return success({ status: ready ? 'ready' : 'not_ready' }, requestId, ready ? 200 : 503); });
}
