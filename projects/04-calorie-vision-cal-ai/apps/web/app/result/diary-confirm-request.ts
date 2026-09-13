// «В дневник» — `PATCH /api/v1/diary/{entryId}` с `{ op: 'confirm' }`, где `entryId` это
// `recognition_id` (он же `scan_id` этого экрана) — ДВА пространства идентификаторов маршрута 11
// канона, осознанно (см. шапку `apps/api/src/routes/diary.ts`). Вынесено в чистую функцию по
// тому же приёму, что и `correct-request.ts`/`capture-upload.ts`: решение «что отправить и как
// разобрать ответ» проверяемо без DOM и без настоящей сети (`.claude/rules/testing.md`).
//
// Путь ТОЛЬКО относительный — `connect-src 'self'` (`middleware.ts`), второго адреса нет и не
// нужно.

export interface DiaryConfirmRequest {
  readonly url: string;
  readonly init: RequestInit;
}

export function buildDiaryConfirmRequest(scanId: string): DiaryConfirmRequest {
  return {
    url: `/api/v1/diary/${scanId}`,
    init: {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'confirm' }),
    },
  };
}

export type DiaryConfirmOutcome =
  | { readonly kind: 'confirmed' }
  | { readonly kind: 'consent_required' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'not_done'; readonly failureReason: string | null }
  | { readonly kind: 'error'; readonly message: string };

interface ErrorBody {
  readonly error?: { readonly code?: string; readonly details?: Record<string, unknown> };
}

async function readFailureReason(response: Response): Promise<string | null> {
  const body = (await response.json().catch(() => null)) as ErrorBody | null;
  const reason = body?.error?.details?.['failure_reason'];
  return typeof reason === 'string' ? reason : null;
}

/**
 * Разбор ответа `PATCH /diary/{entryId}` (`op: 'confirm'`). Коды — ровно те, что называет сервер
 * (`routes/diary.ts`): `200` успех, `403 consent_required`, `404 not_found`, `409 not_done`.
 * Неопознанный код — самый общий отказ (`fail-closed-defaults`), не подставляется как успех.
 */
export async function parseDiaryConfirmResponse(response: Response): Promise<DiaryConfirmOutcome> {
  if (response.status === 200) return { kind: 'confirmed' };
  if (response.status === 403) return { kind: 'consent_required' };
  if (response.status === 404) return { kind: 'not_found' };
  if (response.status === 409) return { kind: 'not_done', failureReason: await readFailureReason(response) };
  return { kind: 'error', message: `Сервер ответил неожиданно (${response.status}) — попробуйте ещё раз.` };
}
