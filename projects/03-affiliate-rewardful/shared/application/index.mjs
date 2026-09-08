import { randomBytes } from 'node:crypto';
import { assert, object, safeTree, str, id, hash, canonical } from '../domain/common.mjs';
import { openDatabase, transaction } from '../infrastructure/postgres.mjs';
import { persistChanges } from '../infrastructure/journal.mjs';
import { seed } from '../infrastructure/seed.mjs';
import { authorize, readActions } from './access.mjs';
import { dispatch } from './dispatch.mjs';
import { exportRegistry } from '../domain/registry.mjs';

export { AppError } from '../domain/common.mjs';
export async function createApplication(options = {}) {
  assert((options.mode ?? process.env.N3_MODE) === 'fixture', 'FIXTURE_ONLY', 503, 'Этот стенд работает только в явно заданном fixture-режиме');
  const clock = options.clock ?? (() => Date.now());
  const now = () => { const value = clock(); const number = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value;
    assert(Number.isFinite(number), 'CLOCK_UNAVAILABLE', 503); return number; };
  const maxDemoRuns = options.maxDemoRuns ?? 200;
  assert(Number.isInteger(maxDemoRuns) && maxDemoRuns > 0 && maxDemoRuns <= 10000);
  const pool = await openDatabase(options);
  async function createDemo(input = {}) {
    safeTree(input); object(input, ['variant', 'role', 'limited'], ['variant', 'role']);
    assert(['A', 'B', 'C', 'D'].includes(input.variant) && ['merchant', 'partner', 'customer'].includes(input.role));
    assert(input.limited === undefined || typeof input.limited === 'boolean');
    return transaction(pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(330804)');
      const count = await client.query('SELECT count(*)::int AS count FROM tenants');
      assert(count.rows[0].count < maxDemoRuns, 'DEMO_LIMIT', 429, 'Достигнут лимит независимых демосеансов');
      const runId = id(), state = seed(runId), token = randomBytes(32).toString('base64url');
      const actor = state.actors.find(a => a.role === input.role);
      const actors = input.limited ? [actor] : state.actors;
      const expiresAt = new Date(now() + 86400000).toISOString();
      await client.query('INSERT INTO tenants (id,state) VALUES ($1,$2)', [runId, JSON.stringify(state)]);
      await persistChanges(client, runId, {}, state);
      await client.query('INSERT INTO sessions (token_hash,tenant_id,actor_ids,expires_at) VALUES ($1,$2,$3,$4)',
        [hash(token), runId, JSON.stringify(actors.map(a => a.id)), expiresAt]);
      return { runId, token, actors, actorId: actor.id, clock: state.clock, seedVersion: state.seedVersion, expiresAt, simulated: true };
    });
  }
  async function execute(context, action, input = {}, idempotencyKey) {
    if (context?.grantId === undefined && context && typeof context === 'object') context = Object.fromEntries(Object.entries(context).filter(([key]) => key !== 'grantId'));
    safeTree(context); object(context, ['token', 'actorId', 'grantId'], ['token', 'actorId']);
    str(context.token, 256); str(context.actorId); str(action, 80);
    if (Object.hasOwn(context, 'grantId')) str(context.grantId);
    safeTree(input); assert(Buffer.byteLength(canonical(input)) <= 65536, 'BODY_TOO_LARGE', 413);
    return transaction(pool, async client => {
      const sessionResult = await client.query('SELECT tenant_id, actor_ids, expires_at FROM sessions WHERE token_hash=$1', [hash(context.token)]);
      const session = sessionResult.rows[0];
      assert(session, 'UNAUTHENTICATED', 401, 'Нужен действующий демосеанс');
      assert(new Date(session.expires_at).getTime() > now(), 'SESSION_EXPIRED', 403, 'Демосеанс истёк');
      assert(session.actor_ids.includes(context.actorId), 'FORBIDDEN', 403, 'Контекст не принадлежит сеансу');
      // All commands, including reads, serialize against tenant mutation and revocation.
      const tenant = await client.query('SELECT state FROM tenants WHERE id=$1 FOR UPDATE', [session.tenant_id]);
      const state = tenant.rows[0]?.state;
      assert(state, 'NOT_FOUND', 404, 'Демосеанс не найден');
      const actor = state.actors.find(a => a.id === context.actorId);
      assert(actor, 'FORBIDDEN', 403, 'Контекст недоступен');
      authorize(state, actor, context, action, input, now());
      const mutating = !readActions.has(action), inputHash = hash(input);
      if (mutating) {
        str(idempotencyKey, 160);
        const previous = await client.query('SELECT input_hash,result FROM command_results WHERE tenant_id=$1 AND actor_id=$2 AND action=$3 AND command_key=$4',
          [session.tenant_id, actor.id, action, idempotencyKey]);
        if (previous.rows[0]) {
          assert(previous.rows[0].input_hash === inputHash, 'IDEMPOTENCY_CONFLICT', 409, 'Этот ключ уже использован для другого запроса');
          assert(new Date(session.expires_at).getTime() > now(), 'SESSION_EXPIRED', 403, 'Демосеанс истёк');
          authorize(state, actor, context, action, input, now());
          if (['registry.export', 'registry.approve'].includes(action)) exportRegistry(state, input);
          return previous.rows[0].result;
        }
      }
      const before = structuredClone(state);
      const result = dispatch(state, actor, context, action, input, now());
      // Synchronous fixture work has no external wait. Recheck wall-clock expiry immediately before publication.
      assert(new Date(session.expires_at).getTime() > now(), 'SESSION_EXPIRED', 403, 'Демосеанс истёк');
      authorize(state, actor, context, action, input, now());
      if (mutating) {
        assert(state.audit.length < 5000, 'DEMO_LIMIT', 429);
        state.audit.push({ id: id(), actorId: actor.id, action, inputHash, at: state.clock, grantId: context.grantId ?? null,
          resourceId: input.artifactId ?? input.taskId ?? input.reservationId ?? input.grantId ?? result.artifactId ?? result.taskId ?? result.id ?? result.paymentId ?? result.eventId ?? null });
        await persistChanges(client, session.tenant_id, before, state);
        await client.query('INSERT INTO command_results (tenant_id,actor_id,action,command_key,input_hash,result) VALUES ($1,$2,$3,$4,$5,$6)',
          [session.tenant_id, actor.id, action, idempotencyKey, inputHash, JSON.stringify(result)]);
      }
      assert(new Date(session.expires_at).getTime() > now(), 'SESSION_EXPIRED', 403, 'Демосеанс истёк');
      authorize(state, actor, context, action, input, now());
      return structuredClone(result);
    });
  }
  return { createDemo, execute, close: () => pool.end() };
}
