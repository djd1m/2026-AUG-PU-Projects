import { randomUUID } from 'node:crypto';
import { DomainError, isDomainError } from '@n8/domain/common';
import { SESSION_TTL_SECONDS } from '@n8/domain/identity';
import type { Base } from './composition';
import { requestClientPeer } from './peer';
export const COOKIE_NAME = 'n8_session';
export const MAX_JSON_BYTES = 256 * 1024;
export const JSON_DEADLINE_MS = 10_000;
export interface ActorContext { accountId: string; requestId: string; expectedVersion?: number }
export interface GuardOptions { access: 'auth' | 'read' | 'mutation' | 'share'; projectId?: string; expectedVersion?: boolean }
export type GuardDeps = Pick<Base, 'auth' | 'projects' | 'rate' | 'hashSubject' | 'config'>;
export function readSessionCookie(request: Request): string | null {
  const parts = (request.headers.get('cookie') ?? '').split(';').map(x => x.trim()).filter(x => x.startsWith(`${COOKIE_NAME}=`));
  if (parts.length !== 1) return null;
  const token = parts[0].slice(COOKIE_NAME.length + 1); return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export function sessionCookie(token: string, origin: string, ttl = SESSION_TTL_SECONDS): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${origin.startsWith('https://') ? '; Secure' : ''}`;
}
export class RateLimitError extends DomainError {
  constructor(readonly retryAfter: number) { super(429, 'RATE_LIMITED', 'Слишком много запросов'); }
}
export async function guardRequest(request: Request, options: GuardOptions, deps: GuardDeps, requestId: string = randomUUID()): Promise<ActorContext> {
  const peer = requestClientPeer(request);
  let accountId = '';
  if (options.access === 'read' || options.access === 'mutation') {
    const token = readSessionCookie(request); const actor = token ? await deps.auth.authenticate(token) : null;
    if (!actor) throw new DomainError(401, 'UNAUTHENTICATED', 'Войдите в аккаунт'); accountId = actor.accountId;
  }
  if (options.access !== 'read') {
    const kind = options.access === 'auth' ? 'auth' : options.access === 'share' ? 'share' : 'mutation';
    const result = await deps.rate.hit(deps.hashSubject(kind === 'mutation' ? accountId : peer), kind, kind === 'auth' ? 10 : 60);
    if (!result.allowed) throw new RateLimitError(result.retryAfter);
    if (options.access !== 'share' && request.headers.get('origin') !== deps.config.publicOrigin) throw new DomainError(403, 'ORIGIN_FORBIDDEN', 'Источник запроса не разрешён');
  }
  let expectedVersion: number | undefined;
  if (options.projectId) {
    const project = await deps.projects.get(accountId, options.projectId);
    if (options.access === 'mutation' && project.state === 'archived') throw new DomainError(409, 'PROJECT_ARCHIVED', 'Проект в архиве');
  }
  if (options.expectedVersion) {
    const raw = request.headers.get('if-match');
    if (!raw) throw new DomainError(428, 'VERSION_REQUIRED', 'Требуется версия проекта');
    if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new DomainError(400, 'INVALID_VERSION', 'Неверная версия проекта');
    expectedVersion = Number(raw);
  }
  return { accountId, requestId, ...(expectedVersion === undefined ? {} : { expectedVersion }) };
}
/** Sole JSON body reader, called only after the pre-body gate has released DB connections. */
export async function readJson(request: Request, deadlineMs = JSON_DEADLINE_MS): Promise<unknown> {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new DomainError(415, 'JSON_REQUIRED', 'Ожидается JSON');
  const length = request.headers.get('content-length');
  if (length && (!/^[0-9]+$/.test(length) || Number(length) > MAX_JSON_BYTES)) throw new DomainError(413, 'BODY_TOO_LARGE', 'Тело запроса слишком велико');
  const reader = request.body?.getReader(); if (!reader) throw new DomainError(400, 'INVALID_JSON', 'Некорректный JSON');
  let timer: ReturnType<typeof setTimeout> | undefined; let bytes = 0; const chunks: Uint8Array[] = [];
  const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { reject(new DomainError(408, 'BODY_TIMEOUT', 'Истекло время чтения')); void reader.cancel().catch(() => {}); }, deadlineMs); });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]); if (done) break;
      bytes += value.byteLength; if (bytes > MAX_JSON_BYTES) throw new DomainError(413, 'BODY_TOO_LARGE', 'Тело запроса слишком велико'); chunks.push(value);
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { throw new DomainError(400, 'INVALID_JSON', 'Некорректный JSON'); }
  } finally { if (timer) clearTimeout(timer); void reader.cancel().catch(() => {}); }
}
export function success(data: unknown, requestId: string, status = 200, version?: number, headers?: HeadersInit): Response {
  const outputHeaders = new Headers(headers); outputHeaders.set('Cache-Control', 'no-store');
  if (version !== undefined) outputHeaders.set('ETag', String(version));
  return Response.json({ data, meta: { requestId, ...(version === undefined ? {} : { version }) } }, { status, headers: outputHeaders });
}
export function failure(error: unknown, requestId: string): Response {
  const known = isDomainError(error); const status = known ? error.status : 503;
  return Response.json({ error: { code: known ? error.code : 'UNAVAILABLE', message: known ? error.message : 'Сервис временно недоступен',
    ...(known && error.fields ? { fields: error.fields } : {}) }, meta: { requestId } },
  { status, headers: { 'Cache-Control': 'no-store', ...(error instanceof RateLimitError ? { 'Retry-After': String(error.retryAfter) } : {}) } });
}
export type SafeLog = (event: { requestId: string; code: string; latencyMs: number }) => void;
export function route(handler: (request: Request, requestId: string) => Promise<Response>, log: SafeLog = event => console.error(JSON.stringify(event))) {
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID(); const start = performance.now();
    try { return await handler(request, requestId); }
    catch (error) { log({ requestId, code: isDomainError(error) ? error.code : 'UNAVAILABLE', latencyMs: Math.round(performance.now() - start) }); return failure(error, requestId); }
  };
}
