import { OnboardingError, type OnboardingCode } from '../../../../../packages/db/src/onboarding-contract';
export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, readonly retryAfter?: number) {
    super(code); this.name = 'HttpError';
  }
}
const statuses: Record<OnboardingCode, number> = {
  invalid_input: 422, invalid_credentials: 401, enrollment_unavailable: 404,
  unauthorized: 401, forbidden: 404, conflict: 409, terms_changed: 409,
  policy_unavailable: 409, integration_not_ready: 409, overloaded: 503,
  queue_timeout: 503, canceled: 503, unavailable: 503,
};
const messages: Record<string, string> = {
  invalid_input: 'Проверьте заполненные поля.', invalid_credentials: 'Не удалось войти. Проверьте email и пароль.',
  enrollment_unavailable: 'Приглашение недоступно.', unauthorized: 'Войдите в аккаунт.',
  forbidden: 'Объект недоступен.', conflict: 'Данные изменились. Обновите страницу; если аккаунт уже есть, войдите.',
  terms_changed: 'Условия изменились. Прочитайте актуальную версию.', policy_unavailable: 'Владелец ещё не опубликовал условия.',
  integration_not_ready: 'Программа пока не активна: подключение Proofwall ещё не готово.',
  csrf_rejected: 'Обновите страницу и повторите действие.', body_too_large: 'Объём данных слишком большой.',
  body_timeout: 'Не удалось получить данные вовремя.', rate_limited: 'Слишком много запросов. Попробуйте позже.',
  unavailable: 'Сервис временно недоступен. Попробуйте позже.',
};
export function privateHeaders(): Headers {
  return new Headers({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff' });
}
export function jsonData(data: unknown, requestId: string, status = 200): Response {
  return Response.json({ data, meta: { request_id: requestId } }, { status, headers: privateHeaders() });
}
export function errorResponse(error: unknown, requestId: string): Response {
  const known = error instanceof HttpError || error instanceof OnboardingError;
  const status = error instanceof HttpError ? error.status : error instanceof OnboardingError ? statuses[error.code] : 503;
  const code = known ? error.code : 'unavailable';
  const headers = privateHeaders();
  if (error instanceof HttpError && error.retryAfter !== undefined) headers.set('Retry-After', String(error.retryAfter));
  // Never print exceptions: pg/request/identity error objects can contain private values.
  return Response.json({ error: { code, message: messages[code] ?? messages.unavailable },
    meta: { request_id: requestId } }, { status, headers });
}
