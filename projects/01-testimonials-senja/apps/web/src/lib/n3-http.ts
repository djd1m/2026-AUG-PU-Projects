import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, hashSessionToken } from './session';
import { currentAccountId } from './current-session';
import { baseUrl } from './urls';
import { readBodyAtMost } from './request-body';
import { N3Error, record } from '../../../../services/worker/src/n3-client';
import type { ProofAuthority } from './n3-proof';

export async function n3Authority(): Promise<ProofAuthority> {
  const accountId = await currentAccountId();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!accountId || !token) throw new N3Error('N3_SESSION_REQUIRED', 401);
  return { accountId, sessionHash: hashSessionToken(token) };
}
export async function n3Body(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('origin') !== new URL(baseUrl()).origin) throw new N3Error('N3_ORIGIN', 403);
  const raw = await readBodyAtMost(request, 4096);
  if (raw === null) throw new N3Error('N3_BODY_LIMIT', 413);
  try { const body: unknown = JSON.parse(raw); if (record(body)) return body; } catch { /* bounded malformed input */ }
  throw new N3Error('N3_BODY', 400);
}
const messages: Record<string, string> = {
  N3_SESSION_REQUIRED: 'Войдите в аккаунт заново.', N3_RATE_LIMIT: 'Повторите запрос письма позже: не чаще раза в минуту.',
  N3_NOT_REFERRED: 'Этот аккаунт не участвует в партнёрской программе.',
  N3_QUEUE_FULL: 'Доставка временно занята. Повторите позже.', N3_PROOF_REQUIRED: 'Подтвердите почту для партнёрской покупки.',
  N3_BIND_PENDING: 'Подтверждение почты сохранено. Доставка в партнёрскую программу ожидается.',
  N3_RECONCILIATION: 'Платёж требует сверки. Новый платёж автоматически не создаётся.',
};
export function n3Failure(error: unknown): NextResponse {
  const status = error instanceof N3Error ? error.status : 503;
  const code = error instanceof N3Error ? error.code : 'N3_UNAVAILABLE';
  return NextResponse.json({ error: messages[code] ?? 'Операция не завершена. Попробуйте позже.', code }, { status });
}
