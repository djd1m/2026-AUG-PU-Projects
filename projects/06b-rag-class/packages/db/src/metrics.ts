import type { Pool, PoolClient } from './pool.js';
import { withService } from './tenant.js';

export const METRIC_BATCH_SIZE = 5;
export const METRIC_BATCH_MS = 60_000;
// One transaction-scoped lease for the entire manual verifier, across web instances.
const METRIC_LEASE_KEY = 611_015;

export interface MetricInstall {
  id: string;
  bot_id: string;
  account_id: string;
  public_id: string;
  origin_host: string;
  page_url: string;
  config_seen_at: string;
  first_question_at: string;
  page_verified_at: string | null;
}
export interface MetricTotals { impressions: number; clicks: number; signups: number }
export type MetricEligibility = (row: MetricInstall) => boolean;

export async function metricOperator(client: PoolClient, accountId: string): Promise<boolean> {
  return (await client.query('SELECT 1 FROM operator WHERE account_id = $1', [accountId])).rowCount === 1;
}
export function isMetricOperator(pool: Pool, accountId: string): Promise<boolean> {
  return withService(pool, (c) => metricOperator(c, accountId));
}

const INSTALL_SELECT = `SELECT w.id, w.bot_id, b.account_id, b.public_id, w.origin_host, w.page_url,
  w.config_seen_at::text, w.first_question_at::text, w.page_verified_at::text
  FROM widget_install w JOIN bot b ON b.id = w.bot_id JOIN account a ON a.id = b.account_id
  WHERE w.config_seen_at IS NOT NULL AND w.first_question_at IS NOT NULL
    AND NOT a.is_test AND NOT EXISTS (SELECT 1 FROM operator o WHERE o.account_id = a.id)`;

export function readWeeklyMetrics(pool: Pool, actor: string): Promise<{
  installs: MetricInstall[]; totals: MetricTotals;
} | null> {
  return withService(pool, async (c) => {
    if (!await metricOperator(c, actor)) return null;
    const installs = (await c.query<MetricInstall>(INSTALL_SELECT)).rows;
    const totals = (await c.query<MetricTotals>(`SELECT
      (SELECT count(*)::int FROM badge_event WHERE kind = 'impression') AS impressions,
      (SELECT count(*)::int FROM badge_event WHERE kind = 'click') AS clicks,
      (SELECT count(*)::int FROM account WHERE referred_by_bot_id IS NOT NULL) AS signups`)).rows[0]!;
    return { installs, totals };
  });
}

export interface MetricBatch {
  readonly rows: readonly MetricInstall[];
  readonly nextId: string | null;
  readonly deadline: number;
  authorized(): Promise<boolean>;
  markVerified(row: MetricInstall): Promise<boolean>;
  finish(commit: boolean): Promise<void>;
}
export type MetricBatchResult = { kind: 'busy' } | { kind: 'unauthorized' } | { kind: 'ready'; batch: MetricBatch };

/** Ownership transfers to after() only after acquisition/selection; scheduler failures roll it back. */
export async function acquireMetricBatch(pool: Pool, actor: string, afterId: string | null,
  eligible: MetricEligibility): Promise<MetricBatchResult> {
  const c = await pool.connect();
  let closed = false;
  const connectionFailed = () => {
    if (!closed) { closed = true; c.release(true); }
  };
  c.on('error', connectionFailed);
  const finish = async (commit: boolean) => {
    if (closed) return;
    closed = true;
    try { await c.query(commit ? 'COMMIT' : 'ROLLBACK'); }
    catch (error) { c.removeListener('error', connectionFailed); c.release(true); throw error; }
    c.removeListener('error', connectionFailed);
    c.release();
  };
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE n6b_service');
    await c.query("SET LOCAL statement_timeout = '5s'");
    // A callback that never runs cannot retain the connection/lease indefinitely.
    await c.query("SET LOCAL idle_in_transaction_session_timeout = '75s'");
    if (!await metricOperator(c, actor)) { await finish(false); return { kind: 'unauthorized' }; }
    const lock = await c.query<{ acquired: boolean }>('SELECT pg_try_advisory_xact_lock($1) AS acquired', [METRIC_LEASE_KEY]);
    if (!lock.rows[0]!.acquired) { await finish(false); return { kind: 'busy' }; }
    const deadline = Date.now() + METRIC_BATCH_MS;
    const pending = (await c.query<MetricInstall>(`${INSTALL_SELECT}
      AND w.page_verified_at IS NULL AND ($1::uuid IS NULL OR w.id > $1::uuid) ORDER BY w.id`, [afterId])).rows.filter(eligible);
    const rows = pending.slice(0, METRIC_BATCH_SIZE);
    const nextId = pending.length > METRIC_BATCH_SIZE ? rows[rows.length - 1]!.id : null;
    const batch: MetricBatch = {
      rows, nextId, deadline,
      authorized: () => metricOperator(c, actor),
      markVerified: async (row) => {
        const result = await c.query(`UPDATE widget_install w SET page_verified_at = clock_timestamp()
          FROM bot b JOIN account a ON a.id = b.account_id
          WHERE w.id = $1 AND w.bot_id = b.id AND b.id = $2 AND b.account_id = $3 AND b.public_id = $4
            AND w.origin_host = $5 AND w.page_url = $6 AND w.config_seen_at = $7::timestamptz
            AND w.first_question_at = $8::timestamptz AND w.page_verified_at IS NULL
            AND NOT a.is_test AND NOT EXISTS (SELECT 1 FROM operator o WHERE o.account_id = a.id)
            AND EXISTS (SELECT 1 FROM operator o WHERE o.account_id = $9)`,
        [row.id, row.bot_id, row.account_id, row.public_id, row.origin_host, row.page_url,
          row.config_seen_at, row.first_question_at, actor]);
        return result.rowCount === 1;
      },
      finish,
    };
    return { kind: 'ready', batch };
  } catch (error) {
    if (!closed) await finish(false).catch(() => undefined);
    throw error;
  }
}
