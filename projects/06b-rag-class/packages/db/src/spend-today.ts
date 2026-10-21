// Сводка расхода за сутки по Москве (01_plan.md §6) — функция-запрос для /admin/metrics (страница — фича weekly-metric)
// и для команды оператора `ops-cli spend-today`. Пустота показывается как пустота: нет строки счётчика или нет попыток —
// null («нет данных»), а не 0 % (honest-configuration CFG-I7). Деньги — оценка [H] по токенам журнала, не счёт.

import { MODEL_CALL_KINDS, MODEL_CALL_STATES } from './enums.js';
import type { Pool } from './pool.js';
import { moscowDay } from './quota.js';
import { globalScopes, type Limits } from './quota-keys.js';
import { withService } from './tenant.js';

/** Самый длинный дедлайн вызова (батч индексации 30 с) + 60 с: 'started' старше — «исход неизвестен». */
export const UNKNOWN_OUTCOME_AFTER_SECONDS = 90;
/** «Исход неизвестен» считается за последние 48 ч от момента сводки, а не за текущие сутки МСК. */
export const UNKNOWN_OUTCOME_WINDOW_HOURS = 48;
export const ALERT_GLOBAL_SHARE = 0.8;
export const ALERT_FAILED_SHARE_HOUR = 0.05;

// Цены [H] (Architecture → External Dependencies): USD за 1 млн токенов.
const PRICE_PER_M = { embedIn: 0.02, answerIn: 0.40, answerOut: 1.60 } as const;

export interface GlobalUsage {
  readonly scope: string;
  readonly limit: number;
  /** null — строки за сегодня нет: расхода по ключу не было, «нет данных». */
  readonly used: number | null;
  readonly share: number | null;
  readonly alert: boolean;
}

export interface SpendToday {
  readonly day: string;
  readonly globals: readonly GlobalUsage[];
  /** kind → state → число попыток за сутки. Пустой объект вида — попыток не было. */
  readonly attempts: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** Попытки 'started' старше 90 с за последние 48 ч (через полночь МСК тоже). */
  readonly unknownOutcome: number;
  /** Доля failed за последний час; null — попыток за час не было (0/0 не равно 0 %). */
  readonly failedShareLastHour: number | null;
  readonly estimatedUsd: number | null;
  readonly alerts: readonly string[];
}

export async function spendToday(pool: Pool, limits: Limits, at: Date = new Date()): Promise<SpendToday> {
  const day = moscowDay(at);
  const globals = globalScopes(limits);
  return withService(pool, async (c) => {
    const counters = await c.query<{ scope: string; used: number }>(
      'SELECT scope, used FROM quota_counter WHERE day = $1::date AND scope = ANY($2::text[])',
      [day, globals.map((g) => g.scope)]);
    const usedBy = new Map(counters.rows.map((r) => [r.scope, Number(r.used)]));
    const calls = await c.query<{ kind: string; state: string; n: string; tin: string | null; tout: string | null }>(
      `SELECT kind, state, count(*) AS n, sum(tokens_in) AS tin, sum(tokens_out) AS tout FROM model_call_log
        WHERE (created_at AT TIME ZONE 'Europe/Moscow')::date = $1::date GROUP BY kind, state`, [day]);
    // Окно «исход неизвестен» — скользящее, а не сутки МСК: попытка, повисшая в 23:59, не пропадает с панели в полночь
    // (08_review.md F-4). Деньги по ней уже списаны, и оператор должен её видеть.
    const unknown = await c.query<{ n: string }>(
      `SELECT count(*) AS n FROM model_call_log WHERE state = 'started'
        AND created_at >= $1::timestamptz - make_interval(hours => $3)
        AND created_at < $1::timestamptz - make_interval(secs => $2)`,
      [at.toISOString(), UNKNOWN_OUTCOME_AFTER_SECONDS, UNKNOWN_OUTCOME_WINDOW_HOURS]);
    const hour = await c.query<{ total: string; failed: string }>(
      `SELECT count(*) AS total, count(*) FILTER (WHERE state = 'failed') AS failed FROM model_call_log
        WHERE created_at > $1::timestamptz - interval '1 hour' AND created_at <= $1::timestamptz`, [at.toISOString()]);

    const alerts: string[] = [];
    const globalUsage = globals.map(({ scope, limit }): GlobalUsage => {
      const used = usedBy.get(scope) ?? null;
      const share = used === null ? null : used / limit;
      const alert = share !== null && share >= ALERT_GLOBAL_SHARE;
      if (alert) alerts.push(`${scope}: ${used}/${limit} (≥ ${ALERT_GLOBAL_SHARE * 100} %)`);
      return { scope, limit, used, share, alert };
    });

    const attempts: Record<string, Record<string, number>> = {};
    for (const kind of MODEL_CALL_KINDS) attempts[kind] = {};
    let usd = 0;
    let tokensSeen = false;
    for (const row of calls.rows) {
      if (!MODEL_CALL_STATES.includes(row.state as (typeof MODEL_CALL_STATES)[number])) continue;
      attempts[row.kind] = { ...(attempts[row.kind] ?? {}), [row.state]: Number(row.n) };
      const tin = row.tin === null ? null : Number(row.tin);
      const tout = row.tout === null ? null : Number(row.tout);
      if (tin !== null || tout !== null) tokensSeen = true;
      if (row.kind === 'answer') usd += ((tin ?? 0) * PRICE_PER_M.answerIn + (tout ?? 0) * PRICE_PER_M.answerOut) / 1e6;
      else usd += ((tin ?? 0) * PRICE_PER_M.embedIn) / 1e6;
    }

    const total = Number(hour.rows[0]?.total ?? 0);
    const failed = Number(hour.rows[0]?.failed ?? 0);
    const failedShare = total === 0 ? null : failed / total;
    if (failedShare !== null && failedShare > ALERT_FAILED_SHARE_HOUR) {
      alerts.push(`failed за час: ${failed}/${total} (> ${ALERT_FAILED_SHARE_HOUR * 100} %)`);
    }
    return { day, globals: globalUsage, attempts, unknownOutcome: Number(unknown.rows[0]?.n ?? 0),
      failedShareLastHour: failedShare, estimatedUsd: tokensSeen ? Math.round(usd * 1e4) / 1e4 : null, alerts };
  });
}
