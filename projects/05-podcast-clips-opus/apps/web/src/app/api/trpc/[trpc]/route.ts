import { randomUUID } from 'node:crypto';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '../../../../server/trpc';
import { getUploadRuntime } from '../../../../server/upload-runtime';
import { authorizeUpload, readUploadJson, uploadFailure } from '../../../../server/upload-handler';
import { getScreenRuntime } from '../../../../server/screen-runtime';
import { readSessionCookie } from '../../../../server/auth-handler';
import { allowRead } from '../../../../server/rate-limit';
import { clientIp } from '../../../../server/ip';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const deps = getUploadRuntime();
    const account = await authorizeUpload(request, deps); // До чтения тела, в том числе tRPC batching.
    const body = await readUploadJson(request);
    const bounded = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(body) });
    return await fetchRequestHandler({ endpoint: '/api/trpc', req: bounded, router: appRouter, allowBatching: false,
      createContext: () => ({ account, idempotencyKey: request.headers.get('idempotency-key'), requestId, video: deps.video, retry: deps.retry, screen: deps.screen, links: deps.links, guests: deps.guests }),
      responseMeta: ({ errors }) => ({ status: errors.length ? undefined : 202, headers: { 'Cache-Control': 'private, no-store' } }) });
  } catch (error) { return uploadFailure(error, requestId); }
}
export async function GET(request: Request) {
  const requestId = randomUUID();
  try {
    const deps = getScreenRuntime();
    const token = readSessionCookie(request);
    const session = token ? await deps.auth.authenticate(token) : null;
    if (!await allowRead(deps.redis, clientIp(request.headers, deps.config.trustedProxyHops), deps.config.sessionSecret, session?.account_id)) {
      return Response.json({ error: { message: 'Слишком много запросов. Повторите через минуту' } }, { status: 429, headers: { 'Cache-Control': 'no-store' } });
    }
    if (!session) return Response.json({ error: { message: 'Войдите в аккаунт' } }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    return await fetchRequestHandler({ endpoint: '/api/trpc', req: request, router: appRouter, allowBatching: false,
      createContext: () => ({ account: session.account_id, idempotencyKey: null, requestId, screen: deps.screen,
        video: { create: async () => { throw new Error('GET cannot create'); } } }),
      responseMeta: () => ({ headers: { 'Cache-Control': 'private, no-store' } }) });
  } catch (error) { return uploadFailure(error, requestId); }
}
