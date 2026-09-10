import { NextResponse } from 'next/server';
import { AgentHostError, record } from './security';
export function failure(error: unknown): NextResponse {
  const known = error instanceof AgentHostError;
  const core =
    record(error) && typeof error.code === 'string' && /^[A-Za-z_]{3,64}$/.test(error.code);
  const status = known
    ? error.status
    : core &&
        typeof error.status === 'number' &&
        [400, 401, 403, 404, 409, 429].includes(error.status)
      ? error.status
      : 503;
  return NextResponse.json(
    {
      error: {
        code: known ? error.code : core ? error.code : 'UNAVAILABLE',
        message: 'Операция не выполнена. Проверьте разрешения и повторите запрос.',
      },
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
