// Кабинеты партнёра и владельца — сетевые обёртки БЕЗ DOM (тот же приём, что
// `diary-request.ts`): строят запрос и разбирают ответ, проверяемы без браузера.
//
// Маршруты — канон: `GET /api/v1/partner/earnings`, `GET /api/v1/partner/dashboard`,
// `GET /api/v1/admin/overview`, `POST /api/v1/admin/payouts`. Пути ТОЛЬКО относительные
// (`connect-src 'self'`, `middleware.ts`).
//
// Кто что видит — решает СЕРВЕР, не этот файл: партнёрство — по строке `partner`,
// владение — по закрытому списку `telegram_user_id` в `routes/admin.ts`. Ответ `404` на
// маршрутах владельца намеренно неотличим от «маршрута нет» — здесь он читается как
// `closed`, и это единственное, что клиент вправе знать.

export const EARNINGS_URL = '/api/v1/partner/earnings';
export const ADMIN_OVERVIEW_URL = '/api/v1/admin/overview';
export const ADMIN_PAYOUTS_URL = '/api/v1/admin/payouts';
export const AUTH_DEVICE_URL = '/api/v1/auth/device';

export const ADMIN_PARTNERS_URL = '/api/v1/admin/partners';
export const PAYOUT_DETAILS_URL = '/api/v1/partner/payout-details';
export const NOTIFICATIONS_URL = '/api/v1/notifications';

export interface PayoutDetails {
  readonly method: 'sbp' | 'other' | null;
  readonly phone_masked: string | null;
  readonly bank: string | null;
  readonly note: string | null;
}

export async function fetchPayoutDetails(): Promise<PayoutDetails | null> {
  const response = await fetch(PAYOUT_DETAILS_URL, { credentials: 'same-origin' }).catch(() => null);
  if (response === null || response.status !== 200) return null;
  const body = (await response.json().catch(() => null)) as { data?: PayoutDetails } | null;
  return body?.data ?? null;
}

const PAYOUT_ERRORS: Record<string, string> = {
  invalid_phone: 'Телефон для СБП обязателен — российский мобильный.',
  invalid_bank: 'Название банка — не длиннее 100 знаков.',
  invalid_note: 'Опишите способ выплаты (до 300 знаков).',
  card_number_refused: 'Номера карт мы не принимаем и не храним. Укажите телефон для СБП.',
  not_partner: 'Реквизиты задаёт партнёр.',
};

export type SavePayoutOutcome = { readonly kind: 'saved' } | { readonly kind: 'rejected'; readonly message: string };

export async function savePayoutDetails(payload: Record<string, unknown>): Promise<SavePayoutOutcome> {
  const response = await fetch(PAYOUT_DETAILS_URL, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => null);
  if (response === null) return { kind: 'rejected', message: 'Нет соединения — проверьте сеть.' };
  if (response.status === 200) return { kind: 'saved' };
  const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
  const code = body?.error?.code;
  return { kind: 'rejected', message: (code !== undefined && PAYOUT_ERRORS[code]) || `Сервер ответил неожиданно (${response.status}).` };
}
export const NOTIFICATIONS_READ_URL = '/api/v1/notifications/read';

export interface NotificationItem {
  readonly id: string;
  readonly kind: string;
  readonly amount_minor: number | null;
  readonly created_at: string;
  readonly text: string;
}

/** Непрочитанные уведомления. Анонимная сессия честно получает пустой список, а не отказ. */
export async function fetchNotifications(): Promise<readonly NotificationItem[]> {
  const response = await fetch(NOTIFICATIONS_URL, { credentials: 'same-origin' }).catch(() => null);
  if (response === null || response.status !== 200) return [];
  const body = (await response.json().catch(() => null)) as { data?: { items?: readonly NotificationItem[] } } | null;
  return body?.data?.items ?? [];
}

export async function markNotificationsRead(): Promise<void> {
  await fetch(NOTIFICATIONS_READ_URL, { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
}

export interface CreatePartnerInput {
  readonly displayName: string;
  readonly contact: string;
  readonly code: string;
}

export type CreatePartnerOutcome =
  | { readonly kind: 'created'; readonly partnerId: string; readonly code: string }
  | { readonly kind: 'rejected'; readonly message: string };

/** Тот же формат, что CHECK в схеме и проверка на сервере. */
export const PARTNER_CODE_RE = /^[A-Z0-9]{4,12}$/;

const CREATE_MESSAGES: Record<string, string> = {
  invalid_display_name: 'Имя партнёра обязательно (до 100 знаков).',
  invalid_contact: 'Контакт обязателен (до 100 знаков).',
  invalid_code: 'Код — от 4 до 12 знаков: заглавная латиница и цифры.',
  invalid_rate: 'Ставка — целое число базисных пунктов от 0 до 10000.',
  code_taken: 'Такой код уже занят — придумайте другой.',
  dependency_unavailable: 'Сервис временно недоступен — попробуйте через минуту.',
};

export async function createPartner(input: CreatePartnerInput): Promise<CreatePartnerOutcome> {
  let response: Response;
  try {
    response = await fetch(ADMIN_PARTNERS_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: input.displayName, contact: input.contact, code: input.code }),
    });
  } catch {
    return { kind: 'rejected', message: 'Нет соединения — проверьте сеть.' };
  }
  const body = (await response.json().catch(() => null)) as
    | { data?: { partner_id?: string; code?: string }; error?: { code?: string } }
    | null;
  if (response.status === 201 && body?.data?.partner_id !== undefined) {
    return { kind: 'created', partnerId: body.data.partner_id, code: body.data.code ?? input.code };
  }
  const code = body?.error?.code;
  return { kind: 'rejected', message: (code !== undefined && CREATE_MESSAGES[code]) || `Сервер ответил неожиданно (${response.status}).` };
}

export function buildInviteCreateUrl(partnerId: string): string {
  return `/api/v1/admin/partners/${encodeURIComponent(partnerId)}/invites`;
}

export type DashboardWindow = 'day' | 'week' | 'all';

export function buildDashboardUrl(window: DashboardWindow): string {
  return `/api/v1/partner/dashboard?window=${window}`;
}

export interface EarningsEntry {
  readonly kind: 'accrual' | 'clawback' | 'payout' | string;
  readonly amount_minor: number;
  readonly available_at: string;
}

export interface Earnings {
  readonly commission_rate_bp: number;
  readonly accrued_total_minor: number;
  readonly clawed_back_total_minor: number;
  readonly paid_out_total_minor: number;
  readonly balance_minor: number;
  readonly due_next_payout_minor: number;
  readonly deferred_to_following_minor: number;
  readonly next_payout_date: string;
  readonly entries: readonly EarningsEntry[];
}

export interface InsufficientData {
  readonly insufficient_data: readonly [n: number, threshold: number];
}
export type DashboardMetric = number | InsufficientData;

export interface Dashboard {
  readonly window: DashboardWindow;
  readonly transitions: number;
  readonly installs: number;
  readonly activations: number;
  readonly shares: number;
  readonly no_data: boolean;
  readonly i: DashboardMetric;
  readonly conv: DashboardMetric;
  readonly updated_at: string;
}

export interface OwnerPartnerRow {
  readonly partner_id: string;
  readonly display_name: string;
  readonly balance_minor: number;
  readonly available_minor: number;
  /** `true` — у партнёра ещё нет аккаунта: владелец может выписать приглашение (OWN-012). */
  readonly needs_invite?: boolean;
}

export interface OwnerOverview {
  readonly revenue_gross_minor: number;
  readonly revenue_net_minor: number;
  readonly payments_count: number;
  readonly subscriptions: Record<string, number>;
  readonly needs_review_count: number;
  readonly partners: readonly OwnerPartnerRow[];
}

/** Исход чтения кабинета — закрытый список; «неизвестный код» читается как `error`. */
export type CabinetOutcome<T> =
  | { readonly kind: 'ok'; readonly data: T }
  | { readonly kind: 'unauthenticated' } // 401 — нужен вход через Telegram
  | { readonly kind: 'not_partner' } // 403 — вошёл, но партнёром не является
  | { readonly kind: 'closed' } // 404 — маршрут владельца закрыт для этого аккаунта
  | { readonly kind: 'error'; readonly message: string };

interface Envelope<T> {
  readonly data?: T;
  readonly error?: { readonly code?: string; readonly message?: string };
}

export async function parseCabinetResponse<T>(response: Response): Promise<CabinetOutcome<T>> {
  if (response.status === 200) {
    const body = (await response.json().catch(() => null)) as Envelope<T> | null;
    if (body?.data === undefined) return { kind: 'error', message: 'Сервер ответил без данных — попробуйте ещё раз.' };
    return { kind: 'ok', data: body.data };
  }
  if (response.status === 401) return { kind: 'unauthenticated' };
  if (response.status === 403) return { kind: 'not_partner' };
  if (response.status === 404) return { kind: 'closed' };
  if (response.status === 503) return { kind: 'error', message: 'Сервис временно недоступен — попробуйте через минуту.' };
  return { kind: 'error', message: `Сервер ответил неожиданно (${response.status}).` };
}

export interface PayoutRequest {
  readonly partner_id: string;
  readonly amount_minor: number;
  readonly payout_key: string;
}

export type PayoutOutcome =
  | { readonly kind: 'recorded'; readonly availableAfterMinor: number }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'rejected'; readonly message: string };

export async function parsePayoutResponse(response: Response): Promise<PayoutOutcome> {
  const body = (await response.json().catch(() => null)) as
    | { data?: { recorded?: boolean; available_after_minor?: number; reason?: string }; error?: { message?: string } }
    | null;
  if (response.status === 201 && body?.data?.recorded === true) {
    return { kind: 'recorded', availableAfterMinor: body.data.available_after_minor ?? 0 };
  }
  if (response.status === 200 && body?.data?.recorded === false) return { kind: 'duplicate' };
  return { kind: 'rejected', message: body?.error?.message ?? `Выплата отклонена (${response.status}).` };
}

/** Рубли из копеек, для показа. Число → строка ТОЛЬКО здесь, чтобы формат был один. */
export function formatRub(minor: number): string {
  const sign = minor < 0 ? '−' : '';
  const abs = Math.abs(minor);
  const rub = Math.floor(abs / 100);
  const kop = abs % 100;
  // Разделитель тысяч — обычный неразрывный пробел, вставленный руками: `toLocaleString`
  // отдаёт разные пробельные символы в разных рантаймах, и один и тот же тест зеленел бы
  // в браузере и падал в Node.
  const grouped = String(rub).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${sign}${grouped},${String(kop).padStart(2, '0')} ₽`;
}

export function formatMetric(metric: DashboardMetric, unit: '%' | ''): string {
  if (typeof metric === 'number') return unit === '%' ? `${(metric * 100).toFixed(1)} %` : String(metric);
  const [n, threshold] = metric.insufficient_data;
  return `мало данных (${n} из ${threshold})`;
}

/** Копейки из строки ввода «1234,56» / «1234.56» / «1234». `null` — не число или ≤ 0. */
export function parseRubInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const minor = Math.round(Number(cleaned) * 100);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
