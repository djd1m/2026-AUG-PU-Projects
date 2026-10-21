import { createStudioClient, type Pool } from '@n6b/db';
import { readJson, readSessionCookie } from './auth-handler';
import { readReferralCookie } from '../lib/referral-cookie';

export interface StudioDeps {
  readonly authenticate: (token: string) => Promise<string | null>;
  readonly servicePool: Pool;
  readonly publicBaseUrl: string;
  readonly log?: (line: string) => void;
}
const fail = (status: number, code: string, message: string) => Response.json({ error: { code, message } },
  { status, headers: { 'Cache-Control': 'no-store' } });

export function createStudioClientHandler(deps: StudioDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      if (request.headers.get('origin') !== new URL(deps.publicBaseUrl).origin) {
        return fail(403, 'forbidden_origin', 'Источник запроса не разрешён');
      }
      const token = readSessionCookie(request);
      const actorId = token ? await deps.authenticate(token) : null;
      if (!actorId) return fail(401, 'unauthorized', 'Войдите в кабинет');
      // Next exposes even a bodyless POST as a stream; only nonempty bytes need a JSON envelope.
      const reader = request.body?.getReader();
      if (reader) {
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4096) {
            await reader.cancel();
            return fail(413, 'body_too_large', 'Тело запроса слишком велико');
          }
          if (value.byteLength) chunks.push(value);
        }
        if (size) {
          const body = await readJson(new Request(request, { body: Buffer.concat(chunks) }), { objectOnly: true });
          if (body === 'too-large') return fail(413, 'body_too_large', 'Тело запроса слишком велико');
          if (body === 'invalid') return fail(422, 'invalid_body', 'Ожидается JSON-объект');
        }
      }
      const result = await createStudioClient(deps.servicePool, actorId, readReferralCookie(request));
      if (result === 'forbidden') return fail(403, 'studio_required', 'Создавать клиентов может только студия');
      if (result === 'cap') return fail(409, 'studio_client_cap', 'предел 5 клиентов в MVP');
      return Response.json({ data: { account_id: result.accountId } },
        { status: 201, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      (deps.log ?? console.error)(`studio: ${(error as Error).name}`);
      return fail(503, 'studio_unavailable', 'Сервис временно недоступен. Повторите позже');
    }
  };
}
