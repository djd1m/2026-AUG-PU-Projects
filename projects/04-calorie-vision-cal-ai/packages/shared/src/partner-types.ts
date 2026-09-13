// Закрытая схема ответов маршрутов `codes/apply` и `partner/dashboard`
// (`docs/features/partner-codes-and-cabinet/03_architecture.md`).
//
// `ApplyCodeOutcome` — РОВНО четыре формы, пятой нет: конфликт, невалидный код и три
// причины отказа anti-fraud/self-referral/code_blocked сведены в закрытые union, а не
// строки — опечатка в имени причины провалит компиляцию, а не станет тихим `undefined`.
//
// `DashboardResponse` НЕ содержит поля `code`: AC-partner-codes-and-cabinet-17 требует,
// чтобы код кабинета разрешался только на сервере, а денежных полей нет вовсе (AC-19) —
// список запрещённых имён закрытый и используется стражем `dashboard-schema.test.ts`.

export type RejectReason = 'code_blocked' | 'self_referral' | 'antifraud_ip_burst';

export type ApplyCodeOutcome =
  | { readonly data: { readonly outcome: 'applied' } }
  | { readonly error: { readonly code: 'conflict'; readonly message: string } } // 409
  | { readonly error: { readonly code: 'invalid_code'; readonly message: string } } // 422
  | { readonly error: { readonly code: 'rejected'; readonly message: string; readonly details: { readonly reason: RejectReason } } }; // 403

/** `insufficient_data` — строка вместо доли при числе наблюдений < `DASHBOARD_OBSERVATION_THRESHOLD`. */
export interface InsufficientData {
  readonly insufficient_data: readonly [n: number, threshold: 30];
}

export type DashboardMetric = number | InsufficientData;

export interface DashboardData {
  readonly window: 'day' | 'week' | 'all';
  readonly transitions: number;
  readonly installs: number;
  readonly activations: number;
  readonly shares: number;
  /** Все четыре счётчика равны нулю — «данных нет», а не отсутствующий ответ (AC-18). */
  readonly no_data: boolean;
  readonly i: DashboardMetric;
  readonly conv: DashboardMetric;
  readonly updated_at: string;
}

export type DashboardResponse = { readonly data: DashboardData };

/**
 * Закрытый список запрещённых имён полей ответа кабинета (AC-19). Проверяется как
 * МНОЖЕСТВО отсутствующих ключей во ВСЁМ дереве ответа, а не подстрокой в тексте: иначе
 * страж запретил бы и случайно похожее разрешённое имя.
 */
export const DASHBOARD_FORBIDDEN_FIELDS: readonly string[] = ['payout', 'rate', 'price', 'earnings', 'balance', 'commission'];

export const DASHBOARD_OBSERVATION_THRESHOLD = 30;
