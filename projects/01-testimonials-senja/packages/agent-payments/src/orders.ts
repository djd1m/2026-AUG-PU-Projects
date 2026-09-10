import type { AgentContext, Offer, QuoteView } from './contracts.js';
import {
  Context,
  type StoredOrder,
  future,
  hash,
  id,
  money,
  requireValue,
  scopeArgs,
  text,
} from './internal.js';
export function validateOffer(offer: Offer, now: Date) {
  money(offer.amount);
  future(offer.expiresAt, now);
  [
    offer.productId,
    offer.termsVersion,
    offer.billingPeriod,
    offer.budgetPeriod,
    offer.description,
  ].forEach(text);
  requireValue(
    typeof offer.autonomousEligible === 'boolean' && typeof offer.attributionRequired === 'boolean',
    'invalid_offer',
    400,
  );
}
export function matchingOffer(a: Offer, b: Offer) {
  return (
    a.productId === b.productId &&
    a.amount.minor === b.amount.minor &&
    a.amount.currency === b.amount.currency &&
    a.termsVersion === b.termsVersion &&
    a.billingPeriod === b.billingPeriod &&
    a.budgetPeriod === b.budgetPeriod &&
    a.attributionRequired === b.attributionRequired
  );
}
export function orders(ctx: Context) {
  return {
    async getOffer(agent: AgentContext, productId: string): Promise<QuoteView> {
      text(productId);
      const grant = await ctx.authenticate(agent);
      const offer = await ctx.options.host.getOffer(grant.scope, productId);
      validateOffer(offer, ctx.now());
      requireValue(offer.productId === productId, 'offer_mismatch');
      const quote: QuoteView = { ...offer, quoteId: id(), scope: grant.scope };
      await ctx.tx(grant.scope, async (c) => {
        await ctx.auth(c, agent);
        await c.query('INSERT INTO agent_payments.quotes VALUES($1,$2,$3,$4,$5)', [
          quote.quoteId,
          ...scopeArgs(grant.scope),
          quote,
        ]);
      });
      return quote;
    },
    async createOrder(agent: AgentContext, input: { quoteId: string; idempotencyKey: string }) {
      text(input.quoteId);
      text(input.idempotencyKey);
      const grant = await ctx.authenticate(agent);
      let order = await ctx.tx(grant.scope, async (c) => {
        await ctx.auth(c, agent);
        const prior = await c.query(
          'SELECT data,payload_hash FROM agent_payments.orders WHERE merchant=$1 AND buyer=$2 AND resource=$3 AND request_key=$4',
          [...scopeArgs(grant.scope), input.idempotencyKey],
        );
        const payloadHash = hash(JSON.stringify({ quoteId: input.quoteId }));
        if (prior.rows[0]) {
          requireValue(prior.rows[0].payload_hash === payloadHash, 'idempotency_conflict');
          return prior.rows[0].data as StoredOrder;
        }
        const q = await c.query(
          'SELECT data FROM agent_payments.quotes WHERE id=$1 AND merchant=$2 AND buyer=$3 AND resource=$4',
          [input.quoteId, ...scopeArgs(grant.scope)],
        );
        requireValue(q.rows[0], 'not_found', 404);
        const quote: QuoteView = q.rows[0].data;
        future(quote.expiresAt, ctx.now());
        const orderId = id();
        const created: StoredOrder = {
          orderId,
          scope: grant.scope,
          quote,
          grantId: grant.grantId,
          paymentStatus: 'prepared',
          fulfillmentStatus: 'not_started',
          attributionStatus: quote.attributionRequired ? 'pending' : 'none',
          nextAction: { kind: 'human_approval', url: ctx.options.host.approvalUrl(orderId) },
          refundedMinor: '0',
          version: 0,
        };
        await c.query('INSERT INTO agent_payments.orders VALUES($1,$2,$3,$4,$5,$6,$7)', [
          orderId,
          ...scopeArgs(grant.scope),
          input.idempotencyKey,
          payloadHash,
          created,
        ]);
        return created;
      });
      if (
        order.paymentStatus === 'prepared' &&
        !order.attributionBinding &&
        ctx.options.host.prepareAttribution
      ) {
        const binding = await ctx.options.host.prepareAttribution(
          grant.scope,
          order.orderId,
          order.quote,
        );
        if (binding) {
          text(binding);
          order = await ctx.tx(grant.scope, async (c) => {
            await ctx.auth(c, agent);
            const latest = await ctx.order(c, grant.scope, order.orderId);
            requireValue(
              !latest.attributionBinding || latest.attributionBinding === binding,
              'attribution_conflict',
            );
            latest.attributionBinding = binding;
            latest.attributionStatus = 'confirmed';
            await ctx.save(c, latest);
            return latest;
          });
        }
      }
      return ctx.view(order);
    },
    async getOrder(agent: AgentContext, orderId: string) {
      const grant = await ctx.authenticate(agent);
      return ctx.tx(grant.scope, async (c) => {
        await ctx.auth(c, agent);
        return ctx.view(await ctx.order(c, grant.scope, orderId));
      });
    },
  };
}
