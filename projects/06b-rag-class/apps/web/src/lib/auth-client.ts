// Отправка форм входа и регистрации в существующие API (/api/auth/*). Чистая функция без DOM — тестируется unit-тестом.
// Текст ошибки берётся из ответа сервера ({error: {message}}); непонятный ответ или обрыв сети — своё сообщение,
// а не «успех» (форма не уводит в кабинет, если сервер его не подтвердил).

export type AuthAction = 'register' | 'login';

export interface AuthFields {
  readonly email: string;
  readonly password: string;
  readonly kind?: 'owner' | 'studio';
}

export type AuthOutcome = { readonly ok: true } | { readonly ok: false; readonly message: string };

const NETWORK_ERROR = 'Нет связи с сервером. Проверьте подключение и повторите.';
const UNKNOWN_ERROR = 'Не удалось выполнить запрос. Повторите позже.';

export async function submitAuth(action: AuthAction, fields: AuthFields,
  fetchImpl: typeof fetch = fetch): Promise<AuthOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(`/api/auth/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(action === 'register' ? fields : { email: fields.email, password: fields.password }),
    });
  } catch {
    return { ok: false, message: NETWORK_ERROR };
  }
  const expected = action === 'register' ? 201 : 200;
  if (response.status === expected) return { ok: true };
  const body = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
  const message = body?.error?.message;
  return { ok: false, message: typeof message === 'string' && message !== '' ? message : UNKNOWN_ERROR };
}
