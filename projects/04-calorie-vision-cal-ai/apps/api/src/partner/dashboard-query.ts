// PartnerDashboard (FR-partner-codes-and-cabinet-9/10/11,
// AC-partner-codes-and-cabinet-15/16/18/19).
//
// Код кабинета разрешается ИСКЛЮЧИТЕЛЬНО из `partner.account_id` вызывающего — эта функция
// НЕ принимает никакого идентификатора кода параметром, только `accountId` вызывающего.
// Страж `dashboard-server-authority-guard.test.ts` проверяет, что маршрут не подмешивает
// сюда значение из query/тела запроса (AC-17).
//
// Окно `day` — СКОЛЬЗЯЩИЕ последние 24 часа от текущего момента, НЕ календарные сутки
// Europe/Moscow (в отличие от квоты): `04_refinement.md`, edge case «окно недели/всех
// пересекает смену тарифного/учётного дня» — окно кабинета скользящее по `created_at`.

import type { DbPool } from '@n4/db';
import { DASHBOARD_OBSERVATION_THRESHOLD, type DashboardData, type DashboardMetric } from '@n4/shared';

export type DashboardWindow = 'day' | 'week' | 'all';

export type DashboardOutcome = { readonly outcome: 'ok'; readonly data: DashboardData } | { readonly outcome: 'not_partner' };

const SELECT_PARTNER_ID = `SELECT id FROM partner WHERE account_id = $1`;

const COUNT_EVENTS = `
  SELECT
    count(*) FILTER (WHERE type = 'card_view')::int   AS transitions,
    count(*) FILTER (WHERE type = 'install')::int     AS installs,
    count(*) FILTER (WHERE type = 'activation')::int  AS activations,
    count(*) FILTER (WHERE type = 'share_click')::int AS shares
  FROM growth_event
  WHERE partner_code_id IN (SELECT id FROM partner_code WHERE partner_id = $1)
    AND ($2::timestamptz IS NULL OR created_at >= $2)
`;

function windowStart(window: DashboardWindow, now: Date): Date | null {
  if (window === 'all') return null;
  const hours = window === 'day' ? 24 : 24 * 7;
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function metricValue(numerator: number, denominator: number): DashboardMetric {
  // Число наблюдений для доли — сам знаменатель (activations для `i`, transitions для
  // `conv`). Порог 30 ловит и знаменатель 0 (0 < 30), поэтому отдельная ветка деления на
  // ноль не нужна (AC-18).
  if (denominator < DASHBOARD_OBSERVATION_THRESHOLD) {
    return { insufficient_data: [denominator, DASHBOARD_OBSERVATION_THRESHOLD] };
  }
  return numerator / denominator;
}

/**
 * `accountId` — ЕДИНСТВЕННЫЙ вход, разрешающий код. Вызывающий (`routes/partner.ts`)
 * обязан передавать `account_id` аутентифицированной сессии, а не значение из запроса.
 */
export async function queryPartnerDashboard(
  pool: DbPool,
  input: { readonly accountId: string; readonly window: DashboardWindow; readonly now?: Date },
): Promise<DashboardOutcome> {
  const partnerRow = await pool.query<{ id: string }>(SELECT_PARTNER_ID, [input.accountId]);
  const partnerId = partnerRow.rows[0]?.id;
  if (partnerId === undefined) return { outcome: 'not_partner' };

  const now = input.now ?? new Date();
  const start = windowStart(input.window, now);
  const counted = await pool.query<{ transitions: number; installs: number; activations: number; shares: number }>(COUNT_EVENTS, [
    partnerId,
    start,
  ]);
  const row = counted.rows[0] ?? { transitions: 0, installs: 0, activations: 0, shares: 0 };

  const noData = row.transitions === 0 && row.installs === 0 && row.activations === 0 && row.shares === 0;

  return {
    outcome: 'ok',
    data: {
      window: input.window,
      transitions: row.transitions,
      installs: row.installs,
      activations: row.activations,
      shares: row.shares,
      no_data: noData,
      i: metricValue(row.shares, row.activations),
      conv: metricValue(row.installs, row.transitions),
      updated_at: now.toISOString(),
    },
  };
}
