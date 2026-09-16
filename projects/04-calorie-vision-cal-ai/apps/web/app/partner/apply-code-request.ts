// Применение партнёрского кода — сетевая обёртка БЕЗ DOM (тот же приём, что `diary-request.ts`
// и `cabinet-request.ts`): строит запрос и разбирает ответ, проверяема без браузера.
//
// Два входа в один маршрут `POST /api/v1/codes/apply`, и они различаются ИСТОЧНИКОМ:
//   • страница `/r/{code}` — переход по ссылке блогера, источник `deeplink` (СЛАБЫЙ);
//   • поле «есть промокод» на `/pro` — код введён руками, источник `explicit` (СИЛЬНЫЙ).
// Разница не косметическая: по ADR-008 явный код вытесняет слабый источник, а слабый слабого
// не вытесняет. Первая ссылка выигрывает у второй; введённый руками код выигрывает у обеих.

export const APPLY_CODE_URL = '/api/v1/codes/apply';
export const AUTH_DEVICE_URL = '/api/v1/auth/device';

export type CodeSource = 'deeplink' | 'explicit';

export type ApplyCodeOutcome =
  | { readonly kind: 'applied' }
  | { readonly kind: 'conflict'; readonly sameCode: boolean }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'rejected'; readonly reason: string }
  | { readonly kind: 'error'; readonly message: string };

/** Формат кода канона: 4–12 знаков, только заглавная латиница и цифры (CHECK в схеме). */
export const CODE_RE = /^[A-Z0-9]{4,12}$/;

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidCodeFormat(raw: string): boolean {
  return CODE_RE.test(normalizeCode(raw));
}

/** Человеческие сообщения по исходу. Неопознанный код ответа — самый общий из известных. */
export function messageFor(outcome: ApplyCodeOutcome, code: string): string {
  switch (outcome.kind) {
    case 'applied':
      return `Код ${code} принят. Оформите подписку — и ваш блогер получит свою долю.`;
    case 'conflict':
      return outcome.sameCode
        ? `Код ${code} уже был применён — всё в порядке, ничего делать не нужно.`
        : 'За вами уже закреплён другой код — этот применить нельзя.';
    case 'invalid':
      return `Код ${code} не найден. Проверьте написание.`;
    case 'rejected':
      if (outcome.reason === 'self_referral') return 'Своим собственным кодом воспользоваться нельзя.';
      if (outcome.reason === 'code_blocked') return 'Этот код заблокирован. Попросите у блогера актуальный.';
      return 'Код отклонён. Попробуйте позже или попросите у блогера актуальный.';
    case 'error':
      return outcome.message;
  }
}

async function postApply(code: string, source: CodeSource): Promise<Response> {
  return fetch(APPLY_CODE_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, source }),
  });
}

export async function parseApplyResponse(response: Response): Promise<ApplyCodeOutcome> {
  if (response.status === 200) return { kind: 'applied' };
  if (response.status === 409) {
    const body = (await response.json().catch(() => null)) as { error?: { details?: { same_code?: boolean } } } | null;
    return { kind: 'conflict', sameCode: body?.error?.details?.same_code === true };
  }
  if (response.status === 422) return { kind: 'invalid' };
  if (response.status === 403) {
    const body = (await response.json().catch(() => null)) as { error?: { details?: { reason?: string } } } | null;
    return { kind: 'rejected', reason: body?.error?.details?.reason ?? 'unknown' };
  }
  if (response.status === 429) return { kind: 'error', message: 'Слишком много попыток — подождите минуту.' };
  return { kind: 'error', message: `Сервер ответил неожиданно (${response.status}).` };
}

/**
 * Применяет код. Сессии устройства у пришедшего по ссылке ещё нет — она заводится ЗДЕСЬ, и
 * запрос повторяется РОВНО один раз (тот же приём, что в `capture-upload.ts`): иначе привязка
 * была бы невозможна для того самого посетителя, ради которого ссылка и существует.
 */
export async function applyCode(rawCode: string, source: CodeSource): Promise<ApplyCodeOutcome> {
  const code = normalizeCode(rawCode);
  if (!isValidCodeFormat(code)) return { kind: 'invalid' };
  let response: Response;
  try {
    response = await postApply(code, source);
    if (response.status === 401) {
      await fetch(AUTH_DEVICE_URL, { method: 'POST', credentials: 'same-origin' });
      response = await postApply(code, source);
    }
  } catch {
    return { kind: 'error', message: 'Нет соединения — проверьте сеть и попробуйте ещё раз.' };
  }
  return parseApplyResponse(response);
}
