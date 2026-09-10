import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readBodyAtMost } from '../request-body';
import { baseUrl } from '../urls';
import type { ProofAuthority } from '../n3-proof';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export class AgentHostError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}
export function enabled() {
  return process.env.AGENT_PAYMENTS_ENABLED === 'true';
}
export function requireEnabled() {
  if (!enabled()) throw new AgentHostError('FEATURE_DISABLED', 404);
}
export function audience() {
  return process.env.AGENT_PAYMENTS_AUDIENCE || 'proofwall-agent-api';
}
export function merchantId() {
  return 'proofwall';
}
export function secureEqual(a: string, b: string) {
  return timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
}
export function gatewayAuthority(request: Request) {
  const expected = process.env.AGENT_GATEWAY_SECRET;
  if (
    !expected ||
    expected.length < 32 ||
    !secureEqual(request.headers.get('x-agent-gateway-key') || '', expected)
  ) {
    throw new AgentHostError('GATEWAY_UNAUTHORIZED', 401);
  }
}
export function agentAuthority(request: Request) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') || '');
  if (!match) throw new AgentHostError('BUYER_UNAUTHORIZED', 401);
  return { token: match[1]!, audience: audience(), merchantId: merchantId() };
}
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function fields(
  value: unknown,
  allowed: string[],
  required = allowed,
): asserts value is Record<string, unknown> {
  if (
    !record(value) ||
    Object.keys(value).some((k) => !allowed.includes(k)) ||
    required.some((k) => !(k in value))
  ) {
    throw new AgentHostError('INVALID_INPUT');
  }
}
export function string(value: unknown, max = 128): string {
  if (typeof value !== 'string' || !value || value.length > max)
    throw new AgentHostError('INVALID_INPUT');
  return value;
}
export function uuid(value: unknown): string {
  const s = string(value);
  if (!UUID.test(s)) throw new AgentHostError('INVALID_INPUT');
  return s;
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  const raw = await readBodyAtMost(request, 16384);
  if (raw === null) throw new AgentHostError('BODY_TOO_LARGE', 413);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (record(parsed)) return parsed;
  } catch {
    /* bounded malformed JSON */
  }
  throw new AgentHostError('INVALID_INPUT');
}
export function csrf(auth: ProofAuthority): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new AgentHostError('UNAVAILABLE', 503);
  return createHmac('sha256', secret)
    .update(`agent-payments:${auth.accountId}:${auth.sessionHash}`)
    .digest('base64url');
}
export function humanCsrf(request: Request, auth: ProofAuthority) {
  if (
    request.headers.get('origin') !== new URL(baseUrl()).origin ||
    !secureEqual(request.headers.get('x-csrf-token') || '', csrf(auth))
  ) {
    throw new AgentHostError('CSRF_REJECTED', 403);
  }
}
