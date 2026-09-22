import { randomUUID } from 'node:crypto';
import { readSessionCookie, type HandlerDependencies } from './auth-handler';
import { clientIp } from './ip';
import { UploadError } from './upload-contract';
import type { VideoService } from './video';
export function uploadJson(body: object, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function authorizeUpload(request: Request, deps: HandlerDependencies): Promise<string> {
  const ip = clientIp(request.headers, deps.trustedProxyHops);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(deps.publicOrigin).origin) throw new UploadError('invalid', 'Источник запроса не разрешён', 403);
  const token = readSessionCookie(request);
  const session = token ? await deps.auth.authenticate(token) : null;
  if (!await deps.allowMutation(ip, session?.account_id)) throw new UploadError('refused', 'Слишком много запросов. Повторите через минуту', 429);
  if (!session) throw new UploadError('invalid', 'Войдите в аккаунт', 401);
  return session.account_id;
}
export async function readUploadJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new UploadError('invalid', 'Ожидается JSON', 422);
  const reader = request.body?.getReader();
  if (!reader) throw new UploadError('invalid', 'Тело запроса отсутствует', 422);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 65536) { await reader.cancel(); throw new UploadError('invalid', 'Тело запроса слишком велико', 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new UploadError('invalid', 'Непригодный JSON', 422); }
}
export function uploadFailure(error: unknown, requestId: string): Response {
  const e = error instanceof UploadError ? error : new UploadError('unavailable',
    'Загрузка временно недоступна. Повторите запрос. Если прямая отправка файла не начинается, проверьте доступ к хранилищу и CORS', 503);
  return uploadJson({ error: { code: e.code, message: e.message, ...e.details }, meta: { request_id: requestId } }, e.status);
}
export function createCompleteHandler(deps: HandlerDependencies & { video: Pick<VideoService, 'complete'> }) {
  return async (request: Request) => {
    const id = randomUUID();
    try {
      const account = await authorizeUpload(request, deps);
      const data = await deps.video.complete(account, await readUploadJson(request));
      return uploadJson({ data, meta: { request_id: id } }, 202);
    } catch (error) { return uploadFailure(error, id); }
  };
}
