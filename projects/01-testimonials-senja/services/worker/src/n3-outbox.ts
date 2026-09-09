import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { N3Error, N3_UUID, type N3Call } from './n3-client.js';

export type JobKind = 'signup' | 'payment.succeeded' | 'refund.succeeded';
export async function enqueueN3(client: PoolClient, accountId: string, kind: JobKind, key: string, payload: unknown): Promise<void> {
  // One global short lock makes capacity admission atomic across all producers.
  await client.query('select pg_advisory_xact_lock(90019, 1)');
  const old = await client.query('select payload = $3::jsonb as same from n3_bridge_outbox where kind=$1 and business_key=$2',
    [kind, key, JSON.stringify(payload)]);
  if (old.rows[0]) {
    if (!old.rows[0].same) throw new N3Error('N3_EVENT_CONFLICT', 409);
    return;
  }
  const count = await client.query('select count(*)::int as n from n3_bridge_outbox where delivered_at is null');
  if (count.rows[0].n >= 10000) throw new N3Error('N3_QUEUE_FULL');
  await client.query('insert into n3_bridge_outbox(account_id,kind,business_key,payload) values($1,$2,$3,$4)',
    [accountId, kind, key, JSON.stringify(payload)]);
}
async function service<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin'); await client.query('set local role app_service');
    const result = await fn(client); await client.query('commit'); return result;
  } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
}
export interface N3Job { id: string; kind: JobKind; account_id: string; payload: Record<string, unknown>; lease_token: string; attempts: number }
export async function claimN3Jobs(pool: Pool): Promise<N3Job[]> {
  return service(pool, async client => (await client.query<N3Job>(
    `with candidates as (
       select id from n3_bridge_outbox where delivered_at is null and next_attempt_at<=now()
         and (lease_until is null or lease_until<now()) order by created_at,id for update skip locked limit 10
     ) update n3_bridge_outbox o set lease_token=$1, lease_until=now()+interval '60 seconds',attempts=attempts+1
       from candidates c where o.id=c.id returning o.*`, [randomUUID()])).rows);
}
export async function acknowledgeN3(pool: Pool, job: N3Job, error?: string): Promise<boolean> {
  return service(pool, async client => {
    const result = await client.query(
      `update n3_bridge_outbox set delivered_at=case when $3::text is null then now() else null end,
        last_error=$3, lease_token=null,lease_until=null,
        next_attempt_at=now()+($4::int*interval '1 second')
        where id=$1 and lease_token=$2 and lease_until>now() and delivered_at is null
        returning account_id,kind,business_key,payload`,
      [job.id, job.lease_token, error ?? null, Math.min(3600, 60 * 2 ** Math.min(6, job.attempts - 1))]);
    const delivered = result.rows[0];
    if (delivered && !error && delivered.kind === 'signup') {
      await client.query(`update n3_email_proofs set bound_at=now() where account_id=$1 and email=$2
        and account_id::text || ':' || id::text = $3`,
        [delivered.account_id, delivered.payload.email, delivered.business_key]);
    }
    return !!result.rowCount;
  });
}
export async function runN3Batch(pool: Pool, call: N3Call): Promise<number> {
  const jobs = await claimN3Jobs(pool); let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    for (;;) {
      const job = jobs[next++]; if (!job) break;
      try {
        const result = await call(job.kind === 'signup' ? 'customers' : 'external-events', job.payload);
        if (job.kind !== 'signup' && (result.accepted !== true || result.orderId !== job.payload.orderId)) {
          throw new N3Error('N3_EVENT_ACK');
        }
        if (job.kind === 'signup' && (result.customerId !== job.payload.customerId || typeof result.bindingId !== 'string'
          || !N3_UUID.test(result.bindingId))) throw new N3Error('N3_CUSTOMER_ACK');
        await acknowledgeN3(pool, job);
      } catch (error) {
        await acknowledgeN3(pool, job, error instanceof N3Error ? error.code : 'N3_DELIVERY_FAILED');
      }
    }
  }));
  return jobs.length;
}
export function startN3Poll(pool: Pool, call: N3Call): () => void {
  let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined;
  async function tick() {
    try { await runN3Batch(pool, call); } catch { console.error('[worker] n3_poll_failed'); }
    if (!stopped) timer = setTimeout(() => void tick(), 5000);
  }
  void tick();
  return () => { stopped = true; clearTimeout(timer); };
}
