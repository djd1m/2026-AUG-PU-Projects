import { NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import { n3Authority } from '@/lib/n3-http';
import { lockProofAuthority } from '@/lib/n3-proof';
import { mailConfigured, sendViaResend } from '@/lib/email';
import { baseUrl } from '@/lib/urls';
import { extractClientIP } from '@/lib/client-ip';
import { paymentEngine } from '@/lib/agent-payments/runtime';
import { AMOUNT, PRODUCT, TERMS } from '@/lib/agent-payments/host';
import {
  approvePairing,
  humanContext,
  issueEmail,
  verifyEmail,
  verified,
} from '@/lib/agent-payments/identity';
import {
  body,
  csrf,
  failure,
  fields,
  humanCsrf,
  requireEnabled,
  string,
  uuid,
  AgentHostError,
} from '@/lib/agent-payments/security';
export const dynamic = 'force-dynamic';
const response = (data: unknown) =>
  NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  try {
    requireEnabled();
    const auth = await n3Authority();
    const state = await withService(async (client) => {
      const email = await lockProofAuthority(client, auth);
      const projects = (
        await client.query(
          'select slug,slug as name from projects where account_id=$1 order by created_at',
          [auth.accountId],
        )
      ).rows;
      const pairingId = new URL(request.url).searchParams.get('pairingId');
      const pairing = pairingId
        ? (
            await client.query(
              `select display_name,audience,expires_at from agent_payment_pairings
        where id=$1 and consumed_at is null and expires_at>clock_timestamp()`,
              [uuid(pairingId)],
            )
          ).rows[0]
        : null;
      const orderId = new URL(request.url).searchParams.get('orderId');
      const order = orderId
        ? (
            await client.query(
              `select o.order_id,p.slug from agent_payment_orders o join projects p on p.id=o.project_id
        where o.order_id=$1 and o.account_id=$2`,
              [uuid(orderId), auth.accountId],
            )
          ).rows[0]
        : null;
      return {
        emailVerified: await verified(client, auth.accountId, email),
        projects,
        pairing,
        order,
      };
    });
    return response({ ...state, csrf: csrf(auth) });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    requireEnabled();
    const auth = await n3Authority();
    humanCsrf(request, auth);
    const input = await body(request),
      action = string(input.action);
    if (action === 'email_send') {
      fields(input, ['action']);
      if (!mailConfigured()) throw new AgentHostError('MAIL_UNAVAILABLE', 503);
      const issued = await issueEmail(auth, extractClientIP(request));
      if (issued.alreadyVerified) return response({ verified: true });
      const link = `${baseUrl()}/agent-payments#${issued.token}`;
      let sent = false;
      try {
        await sendViaResend({
          to: issued.email,
          subject: 'Подтвердите почту Proofwall',
          text: `Подтвердите почту в той же сессии браузера: ${link}\nСсылка действует 24 часа.`,
          html: `<p>Подтвердите почту в той же сессии браузера. Ссылка действует 24 часа.</p><p><a href="${link}">Подтвердить</a></p>`,
        });
        sent = true;
      } catch {
        /* persisted honest delivery status */
      }
      const table = issued.referred ? 'n3_email_tokens' : 'agent_payment_email_tokens';
      await withService((client) =>
        client.query(`update ${table} set delivery_status=$2 where id=$1`, [
          issued.id,
          sent ? 'sent' : 'failed',
        ]),
      );
      if (!sent) throw new AgentHostError('MAIL_UNAVAILABLE', 503);
      return response({ sent: true });
    }
    if (action === 'email_verify') {
      fields(input, ['action', 'token']);
      return response({ verified: await verifyEmail(auth, string(input.token, 43)) });
    }
    if (action === 'pairing_approve') {
      fields(input, ['action', 'slug', 'pairingId', 'consent']);
      if (input.consent !== true) throw new AgentHostError('CONSENT_REQUIRED');
      return response(
        await approvePairing(auth, string(input.slug), uuid(input.pairingId), paymentEngine()),
      );
    }
    fields(
      input,
      ['action', 'slug', 'orderId', 'saveMethod', 'consent', 'grantId', 'mandateId'],
      ['action', 'slug'],
    );
    const human = await humanContext(auth, string(input.slug)),
      engine = paymentEngine();
    if (action === 'order_approve') {
      if (input.consent !== true || typeof input.saveMethod !== 'boolean')
        throw new AgentHostError('CONSENT_REQUIRED');
      return response(
        await engine.approveOrder(human, {
          orderId: uuid(input.orderId),
          saveMethod: input.saveMethod,
        }),
      );
    }
    if (action === 'mandate_create') {
      if (input.consent !== true) throw new AgentHostError('CONSENT_REQUIRED');
      return response(
        await engine.createMandate(human, {
          productId: PRODUCT,
          amount: AMOUNT,
          termsVersion: TERMS,
          validUntil: new Date(Date.now() + 90 * 86400000).toISOString(),
          perPaymentMinor: '99000',
          perBudgetPeriodMinor: '99000',
          sharedBudgetMinor: '99000',
          calendar: 'Europe/Moscow',
        }),
      );
    }
    if (action === 'grant_revoke') {
      await engine.revokeGrant(human, uuid(input.grantId));
      return response({ revoked: true });
    }
    if (action === 'mandate_revoke') {
      await engine.revokeMandate(human, uuid(input.mandateId));
      return response({ revoked: true });
    }
    throw new AgentHostError('UNKNOWN_ACTION');
  } catch (error) {
    return failure(error);
  }
}
