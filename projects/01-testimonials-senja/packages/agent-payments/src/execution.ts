import type { PoolClient } from 'pg';
import type { AgentContext, HumanContext, MandateView, Scope } from './contracts.js';
import {
  Context,
  type Attempt,
  type StoredOrder,
  audit,
  future,
  human,
  id,
  requireValue,
  scopeArgs,
  text,
} from './internal.js';
import { reserve } from './budget.js';
import { releaseCanceledOrder } from './cancellation.js';
import { matchingOffer, validateOffer } from './orders.js';
import { settle } from './settlement.js';
function checkMandate(m: MandateView, order: StoredOrder) {
  const p = m.policy,
    q = order.quote;
  requireValue(
    p.productId === q.productId &&
      p.termsVersion === q.termsVersion &&
      p.amount.currency === q.amount.currency &&
      p.amount.minor === q.amount.minor &&
      BigInt(q.amount.minor) <= BigInt(p.perPaymentMinor),
    'mandate_mismatch',
  );
}
async function loadAttempt(c: PoolClient, order: StoredOrder): Promise<Attempt> {
  const r = await c.query('SELECT data FROM agent_payments.attempts WHERE id=$1 AND order_id=$2', [
    order.attemptId,
    order.orderId,
  ]);
  requireValue(r.rows[0], 'attempt_missing');
  return r.rows[0].data;
}
export function execution(ctx: Context) {
  async function execute(
    scope: Scope,
    orderId: string,
    agent?: AgentContext,
    h?: HumanContext,
    saveMethod = false,
    mandateId?: string,
  ) {
    const snapshot = await ctx.tx(scope, async (c) => {
      if (agent) await ctx.auth(c, agent);
      return ctx.order(c, scope, orderId);
    });
    if (['succeeded', 'failed', 'canceled'].includes(snapshot.paymentStatus))
      return ctx.view(snapshot);
    const current = await ctx.options.host.getOffer(scope, snapshot.quote.productId);
    validateOffer(current, ctx.now());
    const reserved = await ctx.tx(scope, async (c) => {
      const grant = agent ? await ctx.auth(c, agent) : undefined;
      const order = await ctx.order(c, scope, orderId);
      if (['succeeded', 'failed', 'canceled'].includes(order.paymentStatus)) return order;
      if (order.attemptId) return order;
      future(order.quote.expiresAt, ctx.now());
      requireValue(matchingOffer(order.quote, current), 'offer_changed');
      requireValue(
        !order.quote.attributionRequired || order.attributionStatus === 'confirmed',
        'attribution_required',
      );
      const mandate = h ? undefined : await ctx.mandate(c, scope, mandateId);
      if (!h && !mandate) {
        requireValue(!mandateId, 'mandate_unavailable');
        return order;
      }
      let methodReference: string | undefined;
      if (mandate) {
        checkMandate(mandate, order);
        requireValue(current.autonomousEligible, 'renewal_not_eligible');
        requireValue(ctx.options.provider.supportsSavedMethods, 'saved_methods_unsupported');
        const method = await c.query(
          'SELECT data FROM agent_payments.methods WHERE merchant=$1 AND buyer=$2 AND resource=$3 AND provider=$4 AND account=$5',
          [...scopeArgs(scope), ctx.options.provider.provider, ctx.options.provider.accountId],
        );
        if (!method.rows[0]) return order;
        requireValue(method.rows[0].data.test === true, 'method_mode_mismatch');
        methodReference = method.rows[0].data.reference;
      }
      if (saveMethod)
        requireValue(ctx.options.provider.supportsSavedMethods, 'saved_methods_unsupported');
      await reserve(c, order, mandate);
      const attemptId = id();
      const attempt: Attempt = {
        id: attemptId,
        provider: ctx.options.provider.provider,
        accountId: ctx.options.provider.accountId,
        grantId: grant?.grantId ?? order.grantId,
        mandateId: mandate?.mandateId,
        human: !!h,
        request: {
          attemptId,
          orderId,
          scope,
          amount: order.quote.amount,
          description: order.quote.description,
          idempotencyKey: attemptId,
          returnUrl: ctx.options.host.returnUrl(orderId),
          saveMethod,
          methodReference,
        },
      };
      order.attemptId = attemptId;
      order.approvedBy = h?.humanId;
      order.saveMethod = saveMethod;
      order.paymentStatus = 'pending';
      order.nextAction = { kind: 'wait', retryAfterSeconds: 5 };
      if (h)
        await c.query('INSERT INTO agent_payments.consents VALUES($1,$2,$3,$4,$5)', [
          id(),
          ...scopeArgs(scope),
          {
            kind: 'order_approval',
            orderId,
            humanId: h.humanId,
            reference: h.consentReference,
            saveMethod,
            at: ctx.now().toISOString(),
          },
        ]);
      await c.query(
        'INSERT INTO agent_payments.attempts(id,order_id,provider,account,data) VALUES($1,$2,$3,$4,$5)',
        [
          attemptId,
          orderId,
          ctx.options.provider.provider,
          ctx.options.provider.accountId,
          attempt,
        ],
      );
      await ctx.save(c, order);
      return order;
    });
    if (!reserved.attemptId || ['succeeded', 'failed', 'canceled'].includes(reserved.paymentStatus))
      return ctx.view(reserved);
    const dispatchOffer = await ctx.options.host.getOffer(scope, reserved.quote.productId);
    validateOffer(dispatchOffer, ctx.now());
    // A durable fence is never reset. All later execution calls become query-only recovery.
    const dispatch = await ctx.tx(scope, async (c) => {
      const order = await ctx.order(c, scope, orderId);
      const attempt = await loadAttempt(c, order);
      requireValue(
        attempt.provider === ctx.options.provider.provider &&
          attempt.accountId === ctx.options.provider.accountId,
        'attempt_provider_mismatch',
      );
      if (attempt.dispatchedAt || ['succeeded', 'failed', 'canceled'].includes(order.paymentStatus))
        return undefined;
      let authorized =
        Date.parse(order.quote.expiresAt) > ctx.now().getTime() &&
        matchingOffer(order.quote, dispatchOffer);
      if (!attempt.human) {
        const g = await c.query('SELECT data FROM agent_payments.grants WHERE id=$1', [
          attempt.grantId,
        ]);
        const grant = g.rows[0]?.data;
        const mandate = await ctx.mandate(c, scope, attempt.mandateId);
        authorized =
          authorized &&
          !!grant &&
          !grant.revoked &&
          Date.parse(grant.expiresAt) > ctx.now().getTime() &&
          !!mandate &&
          dispatchOffer.autonomousEligible;
        if (mandate) checkMandate(mandate, order);
      }
      if (!authorized) {
        order.paymentStatus = 'canceled';
        order.nextAction = { kind: 'none' };
        await releaseCanceledOrder(c, order);
        await ctx.save(c, order);
        await audit(c, scope, 'dispatch.denied', orderId);
        return undefined;
      }
      attempt.dispatchedAt = ctx.now().toISOString();
      await c.query('UPDATE agent_payments.attempts SET data=$2 WHERE id=$1', [
        attempt.id,
        attempt,
      ]);
      await audit(c, scope, 'dispatch.fenced', attempt.id);
      return attempt;
    });
    if (!dispatch) return ctx.tx(scope, async (c) => ctx.view(await ctx.order(c, scope, orderId)));
    try {
      const result = await ctx.options.provider.create(dispatch.request);
      return await settle(ctx, scope, orderId, result);
    } catch {
      return ctx.tx(scope, async (c) => {
        const order = await ctx.order(c, scope, orderId);
        if (!['succeeded', 'canceled', 'failed'].includes(order.paymentStatus)) {
          order.paymentStatus = 'unknown';
          order.nextAction = { kind: 'wait', retryAfterSeconds: 30 };
          await ctx.save(c, order);
          await audit(c, scope, 'provider.unknown', dispatch.id);
        }
        return ctx.view(order);
      });
    }
  }
  return {
    async executePayment(agent: AgentContext, input: { orderId: string; mandateId?: string }) {
      text(input.orderId);
      if (input.mandateId) text(input.mandateId);
      const grant = await ctx.authenticate(agent);
      return execute(grant.scope, input.orderId, agent, undefined, false, input.mandateId);
    },
    async approveOrder(h: HumanContext, input: { orderId: string; saveMethod: boolean }) {
      human(h);
      text(input.orderId);
      requireValue(typeof input.saveMethod === 'boolean', 'invalid_input', 400);
      return execute(h, input.orderId, undefined, h, input.saveMethod);
    },
  };
}
