import { NextResponse } from 'next/server';
import { extractClientIP } from '@/lib/client-ip';
import { verifyWebhookOrigin } from '@/lib/payment';
import {
  body,
  requireEnabled,
  failure,
  record,
  string,
  AgentHostError,
} from '@/lib/agent-payments/security';
import {
  agentPaymentNotification,
  agentNotificationReference,
} from '@/lib/agent-payments/notification';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    requireEnabled();
    if (!verifyWebhookOrigin(extractClientIP(request)).ok)
      throw new AgentHostError('WEBHOOK_ORIGIN', 400);
    const input = await body(request);
    if (
      !record(input.object) ||
      !['payment.succeeded', 'payment.canceled', 'refund.succeeded'].includes(String(input.event))
    )
      throw new AgentHostError('INVALID_INPUT');
    const event = string(input.event),
      id = string(input.object.id);
    const metadata = await agentNotificationReference(event, id);
    const result = await agentPaymentNotification(event, id, metadata);
    if (result === null) throw new AgentHostError('ORDER_MAPPING', 409);
    return NextResponse.json({ status: result });
  } catch (error) {
    return failure(error);
  }
}
