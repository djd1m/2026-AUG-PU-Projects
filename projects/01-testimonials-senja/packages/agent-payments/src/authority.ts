import { randomBytes } from 'node:crypto';
import type { GrantView, HumanContext, MandatePolicy, MandateView } from './contracts.js';
import {
  Context,
  audit,
  future,
  hash,
  human,
  id,
  money,
  requireValue,
  scopeArgs,
  text,
} from './internal.js';
export function authority(ctx: Context) {
  return {
    async issueGrant(h: HumanContext, input: { audience: string; expiresAt: string }) {
      human(h);
      text(input.audience);
      future(input.expiresAt, ctx.now());
      const token = randomBytes(32).toString('base64url');
      const grant: GrantView = {
        grantId: id(),
        scope: { merchantId: h.merchantId, buyerId: h.buyerId, resourceId: h.resourceId },
        audience: input.audience,
        expiresAt: input.expiresAt,
        revoked: false,
      };
      await ctx.tx(h, async (c) => {
        await c.query('INSERT INTO agent_payments.grants VALUES($1,$2,$3,$4,$5,$6)', [
          grant.grantId,
          ...scopeArgs(h),
          hash(token),
          grant,
        ]);
        await c.query('INSERT INTO agent_payments.consents VALUES($1,$2,$3,$4,$5)', [
          id(),
          ...scopeArgs(h),
          {
            kind: 'agent_grant',
            humanId: h.humanId,
            reference: h.consentReference,
            grantId: grant.grantId,
            at: ctx.now().toISOString(),
          },
        ]);
        await audit(c, h, 'grant.issued', grant.grantId);
      });
      return { ...grant, token };
    },
    async revokeGrant(h: HumanContext, grantId: string) {
      human(h);
      text(grantId);
      await ctx.tx(h, async (c) => {
        const r = await c.query(
          "UPDATE agent_payments.grants SET data=jsonb_set(data,'{revoked}','true') WHERE id=$1 AND merchant=$2 AND buyer=$3 AND resource=$4",
          [grantId, ...scopeArgs(h)],
        );
        requireValue(r.rowCount, 'not_found', 404);
        await audit(c, h, 'grant.revoked', grantId);
      });
    },
    async createMandate(h: HumanContext, policy: MandatePolicy): Promise<MandateView> {
      human(h);
      money(policy.amount);
      future(policy.validUntil, ctx.now());
      [policy.productId, policy.termsVersion, policy.calendar].forEach(text);
      for (const minor of [
        policy.perPaymentMinor,
        policy.perBudgetPeriodMinor,
        policy.sharedBudgetMinor,
      ])
        money({ minor, currency: policy.amount.currency });
      requireValue(
        BigInt(policy.amount.minor) <= BigInt(policy.perPaymentMinor) &&
          BigInt(policy.perPaymentMinor) <= BigInt(policy.perBudgetPeriodMinor) &&
          BigInt(policy.perBudgetPeriodMinor) <= BigInt(policy.sharedBudgetMinor),
        'invalid_limits',
        400,
      );
      const mandate: MandateView = {
        mandateId: id(),
        scope: { merchantId: h.merchantId, buyerId: h.buyerId, resourceId: h.resourceId },
        policy,
        revoked: false,
      };
      await ctx.tx(h, async (c) => {
        const existing = await c.query(
          'SELECT calendar FROM agent_payments.budgets WHERE merchant=$1 AND buyer=$2 AND currency=$3',
          [h.merchantId, h.buyerId, policy.amount.currency],
        );
        requireValue(
          !existing.rows[0] || existing.rows[0].calendar === policy.calendar,
          'calendar_mismatch',
        );
        await c.query(
          `INSERT INTO agent_payments.budgets VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(merchant,buyer,currency) DO UPDATE SET limit_minor=LEAST(agent_payments.budgets.limit_minor,EXCLUDED.limit_minor)`,
          [
            h.merchantId,
            h.buyerId,
            policy.amount.currency,
            policy.calendar,
            policy.sharedBudgetMinor,
          ],
        );
        await c.query('INSERT INTO agent_payments.mandates VALUES($1,$2,$3,$4,$5)', [
          mandate.mandateId,
          ...scopeArgs(h),
          mandate,
        ]);
        await c.query('INSERT INTO agent_payments.consents VALUES($1,$2,$3,$4,$5)', [
          id(),
          ...scopeArgs(h),
          {
            kind: 'mandate',
            humanId: h.humanId,
            reference: h.consentReference,
            mandateId: mandate.mandateId,
            policy,
            at: ctx.now().toISOString(),
          },
        ]);
        await audit(c, h, 'mandate.issued', mandate.mandateId);
      });
      return mandate;
    },
    async revokeMandate(h: HumanContext, mandateId: string) {
      human(h);
      text(mandateId);
      await ctx.tx(h, async (c) => {
        const r = await c.query(
          "UPDATE agent_payments.mandates SET data=jsonb_set(data,'{revoked}','true') WHERE id=$1 AND merchant=$2 AND buyer=$3 AND resource=$4",
          [mandateId, ...scopeArgs(h)],
        );
        requireValue(r.rowCount, 'not_found', 404);
        await audit(c, h, 'mandate.revoked', mandateId);
      });
    },
  };
}
