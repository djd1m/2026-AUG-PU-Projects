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
