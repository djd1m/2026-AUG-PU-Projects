// FR-016 — сетевой слой входа через Yandex ID.
//
// ─────────────────────────────────────────────────────────────────────────────
// ЧЕТВЁРТЫЙ И ПЯТЫЙ ВНЕШНИЕ ВЫЗОВЫ ПРОЕКТА. Состояние названо по факту, а не посылкой:
// FR-015 начался со слов «внешних вызовов не было», и ложная посылка стоила незамеченного
// дефекта в вебхуке оплаты. Полный список — в 03_architecture.md.
//
// Отсюда два требования, оба обязательные:
//   1. ТАЙМАУТ на каждом вызове. Время ответа Яндекса нам не принадлежит; Node исполняет
//      весь продукт в одном потоке, реплика web одна.
//   2. ОБА вызова СНАРУЖИ транзакции. Обеспечено тем, что этот модуль не импортирует ни
//      withService, ни sso-account.ts: вызвать их отсюда нечем.
//
// SDK не используется — по той же причине, что свой клиент почты в FR-015 и свой разбор CSV
// в FR-014: это три HTTP-запроса, обёртка добавила бы звено в цепочку поставки и не отдала
// бы наружу таймаут.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sessionSecret } from './session';
import { baseUrl } from './urls';

/** Верхняя граница ожидания провайдера — как у почты (FR-015) и по той же логике. */
export const SSO_TIMEOUT_MS = 8_000;

/** Сколько живёт начатая попытка входа. Десять минут — с запасом на ввод пароля и
 *  подтверждение на телефоне, но не настолько, чтобы забытая вкладка оставалась дверью. */
export const STATE_TTL_MS = 10 * 60 * 1000;

/** Cookie с состоянием попытки. Не сессия — отдельное имя, отдельный короткий срок. */
export const SSO_STATE_COOKIE = 'pw_sso_state';

const AUTHORIZE_ENDPOINT = 'https://oauth.yandex.ru/authorize';
const TOKEN_ENDPOINT = 'https://oauth.yandex.ru/token';
const INFO_ENDPOINT = 'https://login.yandex.ru/info?format=json';

export class SsoUnavailableError extends Error {}
export class SsoNotConfiguredError extends Error {}

/**
 * Идентификатор и секрет — БЕЗ ПРАВА НА ДЕФОЛТ. Тот же приём, что у RESEND_API_KEY:
 * тихий фолбэк означал бы кнопку «Войти через Яндекс», которая ведёт в осмысленно
 * выглядящую ошибку провайдера вместо нашей внятной (silent-fallbacks.md).
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (value && value.trim() !== '') return value;
  throw new SsoNotConfiguredError(
    `${name} не задан. Вход через Яндекс без него невозможен: кнопка вела бы в ошибку ` +
      'провайдера вместо нашей. Зарегистрируйте приложение на oauth.yandex.ru.',
  );
}

export function ssoConfigured(): boolean {
  try {
    requireEnv('YANDEX_CLIENT_ID');
    requireEnv('YANDEX_CLIENT_SECRET');
    return true;
  } catch {
    return false;
  }
}

export function redirectUri(): string {
  return `${baseUrl()}/api/auth/yandex/callback`;
}

// ── PKCE ──────────────────────────────────────────────────────────────────────
// Нужен, даже когда секрет есть: он привязывает возврат к ТОЙ ЖЕ вкладке, которая начала
// вход. Без него перехваченный код можно предъявить из другого места.

export function generateVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

// ── Состояние между запросами ─────────────────────────────────────────────────
// Новый для проекта класс данных: до FR-016 ничего не приходилось проносить между двумя
// HTTP-запросами. Держим в ПОДПИСАННОЙ httpOnly-cookie, а не в БД: сервер ничего не хранит,
// значит нечего чистить и нечему утекать из дампа.

export interface SsoState {
  state: string;
  verifier: string;
  expiresAt: number;
}

export function packState(value: SsoState): string {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  const mac = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

/** Разбор с проверкой подписи и срока. Любая неудача — null, без различения причин:
 *  разные ответы на «подпись не сошлась» и «протухло» рассказывали бы о внутренностях. */
export function unpackState(raw: string | undefined): SsoState | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);

  const expected = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { state, verifier, expiresAt } = parsed as Partial<SsoState>;
  if (typeof state !== 'string' || typeof verifier !== 'string') return null;
  if (typeof expiresAt !== 'number' || Number.isNaN(expiresAt)) return null;
  if (Date.now() > expiresAt) return null;
  return { state, verifier, expiresAt };
}

export function stateCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // 'lax' ОБЯЗАТЕЛЕН и послаблением не является: возврат от Яндекса приходит GET-редиректом
    // с чужого домена, и при 'strict' cookie не отправилась бы вовсе — вход не работал бы
    // никогда. Тот же довод, что у сессионной cookie про возврат от платёжного провайдера.
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(STATE_TTL_MS / 1000),
  };
}

// ── Шаг 1: адрес страницы согласия ────────────────────────────────────────────

export function authorizeUrl(state: string, verifier: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: requireEnv('YANDEX_CLIENT_ID'),
    redirect_uri: redirectUri(),
    state,
    code_challenge: challengeFor(verifier),
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

// ── Шаг 2: обмен кода на токен ────────────────────────────────────────────────

export interface SsoProfile {
  externalId: string;
  email: string;
}

async function postForm(url: string, body: URLSearchParams): Promise<Response> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(SSO_TIMEOUT_MS),
    });
  } catch (cause) {
    // Сеть недоступна или таймаут. Наружу — свой тип: маршрут обязан отличить это от
    // «провайдер отказал», потому что первое ретраибельно, а второе нет.
    throw new SsoUnavailableError('Яндекс не ответил', { cause });
  }
}

export async function exchangeCode(code: string, verifier: string): Promise<string> {
  const response = await postForm(
    TOKEN_ENDPOINT,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: requireEnv('YANDEX_CLIENT_ID'),
      client_secret: requireEnv('YANDEX_CLIENT_SECRET'),
      code_verifier: verifier,
    }),
  );
  if (!response.ok) {
    // Тело НЕ логируется и наружу не идёт: в нём эхо кода и описание ошибки провайдера.
    throw new SsoUnavailableError(`обмен кода отклонён провайдером: ${response.status}`);
  }
  const data = (await response.json()) as { access_token?: unknown };
  if (typeof data.access_token !== 'string' || data.access_token === '') {
    throw new SsoUnavailableError('провайдер не вернул access_token');
  }
  return data.access_token;
}

// ── Шаг 3: профиль ────────────────────────────────────────────────────────────

export async function fetchProfile(accessToken: string): Promise<SsoProfile> {
  let response: Response;
  try {
    response = await fetch(INFO_ENDPOINT, {
      headers: { authorization: `OAuth ${accessToken}` },
      signal: AbortSignal.timeout(SSO_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new SsoUnavailableError('Яндекс не ответил на запрос профиля', { cause });
  }
  if (!response.ok) {
    throw new SsoUnavailableError(`профиль недоступен: ${response.status}`);
  }

  const data = (await response.json()) as { id?: unknown; default_email?: unknown };

  // id обязателен: это ключ учётной записи. Без него впускать некуда, и «разумного
  // умолчания» здесь не существует — fail-closed-defaults.md.
  if (typeof data.id !== 'string' || data.id === '') {
    throw new SsoUnavailableError('провайдер не вернул идентификатор');
  }
  // Адрес тоже обязателен: учётка без email не сможет ни получить письмо, ни быть найдена.
  // Если права login:email не выданы, поле не приедет — и это надо назвать, а не подставить
  // пустую строку и создать учётку-калеку.
  if (typeof data.default_email !== 'string' || data.default_email === '') {
    throw new SsoUnavailableError(
      'провайдер не вернул адрес почты — вероятно, приложению не выдано право login:email',
    );
  }

  // Адрес возвращается СЫРЫМ. Нормализует его вызывающий — ЕДИНСТВЕННЫМ объявлением
  // normalizeEmailFromInput из validation.ts, тем же, что у регистрации и входа.
  // Свой .trim().toLowerCase() здесь был бы вторым объявлением нормализации, то есть той
  // самой миной, о которой предупреждает шапка login.ts: разойдутся — и человек не попадёт
  // в свою учётку никогда. Страж в tests/sso.test.ts стережёт отсутствие такой пары.
  return { externalId: data.id, email: data.default_email };
}
