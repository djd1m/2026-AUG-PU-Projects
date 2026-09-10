import type { Pool, PoolClient } from 'pg';
import type { Scope, StorePort } from './contracts.js';

/** Shared across grants/resources/currencies: host MUST use this after its project lock. */
export async function lockBuyer(client: PoolClient, scope: Scope): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    JSON.stringify(['agent-payments', scope.merchantId, scope.buyerId]),
  ]);
}
export class PostgresStore implements StorePort {
  constructor(readonly pool: Pool) {}
  async transaction<T>(
    scope: Scope,
    operation: (client: PoolClient) => Promise<T>,
    beforeLock?: (client: PoolClient) => Promise<void>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (beforeLock) await beforeLock(client);
      await lockBuyer(client, scope);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
const schema = `
CREATE SCHEMA IF NOT EXISTS agent_payments;
CREATE TABLE IF NOT EXISTS agent_payments.schema_version (version integer PRIMARY KEY);
CREATE TABLE IF NOT EXISTS agent_payments.grants (
 id text PRIMARY KEY, merchant text NOT NULL, buyer text NOT NULL, resource text NOT NULL,
 token_hash text NOT NULL UNIQUE, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS agent_payments.mandates (
 id text PRIMARY KEY, merchant text NOT NULL, buyer text NOT NULL, resource text NOT NULL, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS agent_payments.consents (
 id text PRIMARY KEY, merchant text NOT NULL, buyer text NOT NULL, resource text NOT NULL, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS agent_payments.methods (
 merchant text NOT NULL, buyer text NOT NULL, resource text NOT NULL, provider text NOT NULL, account text NOT NULL,
 data jsonb NOT NULL, PRIMARY KEY (merchant,buyer,resource,provider,account));
CREATE TABLE IF NOT EXISTS agent_payments.quotes (
 id text PRIMARY KEY, merchant text NOT NULL, buyer text NOT NULL, resource text NOT NULL, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS agent_payments.orders (
 id text PRIMARY KEY, merchant text NOT NULL, buyer text NOT NULL, resource text NOT NULL,
 request_key text NOT NULL, payload_hash text NOT NULL, data jsonb NOT NULL,
 UNIQUE (merchant,buyer,resource,request_key));
CREATE TABLE IF NOT EXISTS agent_payments.attempts (
 id text PRIMARY KEY, order_id text NOT NULL UNIQUE REFERENCES agent_payments.orders(id),
 provider text NOT NULL, account text NOT NULL, provider_id text, data jsonb NOT NULL,
 UNIQUE (provider,account,provider_id));
CREATE TABLE IF NOT EXISTS agent_payments.budgets (
 merchant text NOT NULL, buyer text NOT NULL, currency text NOT NULL, calendar text NOT NULL,
 limit_minor numeric(30,0) NOT NULL CHECK(limit_minor > 0), PRIMARY KEY (merchant,buyer,currency));
CREATE TABLE IF NOT EXISTS agent_payments.reservations (
 order_id text PRIMARY KEY REFERENCES agent_payments.orders(id), merchant text NOT NULL, buyer text NOT NULL,
 mandate_id text, currency text NOT NULL, budget_period text NOT NULL,
 minor numeric(30,0) NOT NULL CHECK(minor > 0), state text NOT NULL CHECK(state IN ('held','consumed','released')));
CREATE TABLE IF NOT EXISTS agent_payments.period_claims (
 merchant text NOT NULL, buyer text NOT NULL, resource text NOT NULL, billing_period text NOT NULL,
 source_id text NOT NULL, PRIMARY KEY (merchant,buyer,resource,billing_period));
CREATE TABLE IF NOT EXISTS agent_payments.human_spend (
 merchant text NOT NULL, buyer text NOT NULL, resource text NOT NULL, source_id text NOT NULL,
 currency text NOT NULL, budget_period text NOT NULL, billing_period text NOT NULL,
 minor numeric(30,0) NOT NULL CHECK(minor > 0), PRIMARY KEY(merchant,buyer,source_id));
CREATE TABLE IF NOT EXISTS agent_payments.events (
 id text PRIMARY KEY, merchant text NOT NULL, buyer text NOT NULL, resource text NOT NULL,
 order_id text NOT NULL, data jsonb NOT NULL, acknowledged boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS agent_payments.refunds (
 provider text NOT NULL, account text NOT NULL, refund_id text NOT NULL,
 order_id text NOT NULL REFERENCES agent_payments.orders(id), minor numeric(30,0) NOT NULL CHECK(minor > 0),
 PRIMARY KEY(provider,account,refund_id));
CREATE TABLE IF NOT EXISTS agent_payments.audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, merchant text NOT NULL, buyer text NOT NULL,
 kind text NOT NULL, subject_id text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now());
INSERT INTO agent_payments.schema_version(version) VALUES (1) ON CONFLICT DO NOTHING;
`;
export async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('agent-payments-migrate', 0))",
    );
    await client.query(schema);
    const { rows } = await client.query(
      'SELECT max(version) AS version FROM agent_payments.schema_version',
    );
    if (rows[0].version !== 1) throw new Error('Unsupported agent-payments schema');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
