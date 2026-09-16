// Вход по почте (OWN-012) — сетевые обёртки без DOM: `/api/v1/auth/register|login|logout|me`,
// `/api/v1/partner/invites/:token`, `/api/v1/partner/enroll`. Пути только относительные
// (`connect-src 'self'`).

export const ME_URL = '/api/v1/auth/me';
export const REGISTER_URL = '/api/v1/auth/register';
export const LOGIN_URL = '/api/v1/auth/login';
export const LOGOUT_URL = '/api/v1/auth/logout';
export const ENROLL_URL = '/api/v1/partner/enroll';

export interface Me {
  readonly authenticated: boolean;
  readonly email?: string | null;
  readonly telegram_linked?: boolean;
  readonly tier?: string;
  readonly partner?: boolean;
  readonly owner?: boolean;
}

export async function fetchMe(): Promise<Me> {
  const response = await fetch(ME_URL, { credentials: 'same-origin' });
  const body = (await response.json().catch(() => null)) as { data?: Me } | null;
  return body?.data ?? { authenticated: false };
}

export type CredentialsOutcome =
  | { readonly kind: 'ok'; readonly email: string; readonly diaryMigrated: number }
  | { readonly kind: 'rejected'; readonly message: string };

const MESSAGES: Record<string, string> = {
  invalid_email: 'Почта не похожа на адрес.',
  invalid_password: 'Пароль — от 8 до 200 знаков.',
  email_taken: 'На эту почту уже есть аккаунт — войдите.',
  invalid_credentials: 'Почта или пароль неверны.',
  account_erasing: 'Аккаунт удаляется, вход закрыт.',
  dependency_unavailable: 'Сервис временно недоступен — попробуйте через минуту.',
};

export async function submitCredentials(url: string, email: string, password: string): Promise<CredentialsOutcome> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { kind: 'rejected', message: 'Нет соединения — проверьте сеть.' };
  }
  const body = (await response.json().catch(() => null)) as { data?: { email?: string; diary_migrated?: number }; error?: { code?: string } } | null;
  if ((response.status === 200 || response.status === 201) && body?.data?.email !== undefined) {
    return { kind: 'ok', email: body.data.email, diaryMigrated: body.data.diary_migrated ?? 0 };
  }
  if (response.status === 429) return { kind: 'rejected', message: 'Слишком много попыток — подождите минуту.' };
  const code = body?.error?.code;
  return { kind: 'rejected', message: (code !== undefined && MESSAGES[code]) || `Сервер ответил неожиданно (${response.status}).` };
}

export async function logout(): Promise<void> {
  await fetch(LOGOUT_URL, { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
}

export function buildInvitePreviewUrl(token: string): string {
  return `/api/v1/partner/invites/${encodeURIComponent(token)}`;
}

export type EnrollOutcome = { readonly kind: 'ok' } | { readonly kind: 'rejected'; readonly message: string };

export async function enroll(token: string): Promise<EnrollOutcome> {
  const response = await fetch(ENROLL_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }).catch(() => null);
  if (response === null) return { kind: 'rejected', message: 'Нет соединения.' };
  if (response.status === 200) return { kind: 'ok' };
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (response.status === 410) return { kind: 'rejected', message: 'Приглашение просрочено или уже использовано.' };
  if (response.status === 409) return { kind: 'rejected', message: body?.error?.message ?? 'Приглашение нельзя принять этим аккаунтом.' };
  if (response.status === 401) return { kind: 'rejected', message: 'Сначала войдите или зарегистрируйтесь.' };
  return { kind: 'rejected', message: body?.error?.message ?? `Сервер ответил неожиданно (${response.status}).` };
}
