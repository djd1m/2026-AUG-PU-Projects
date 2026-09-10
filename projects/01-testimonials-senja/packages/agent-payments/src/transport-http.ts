import type { AgentContext, PaymentsEngine } from './contracts.js';
import { PaymentError } from './internal.js';
export type AgentCommand =
  | { command: 'offer_get'; productId: string }
  | { command: 'order_create'; quoteId: string; requestKey: string }
  | { command: 'payment_execute'; orderId: string; mandateId?: string }
  | { command: 'order_get'; orderId: string };
/** Caller authenticates service credential separately; backend always verifies buyer grant. */
export async function dispatchAgentCommand(
  engine: PaymentsEngine,
  agent: AgentContext,
  input: AgentCommand,
) {
  if (!input || typeof input !== 'object') throw new PaymentError('invalid_command', 400);
  switch (input.command) {
    case 'offer_get':
      return engine.getOffer(agent, input.productId);
    case 'order_create':
      return engine.createOrder(agent, {
        quoteId: input.quoteId,
        idempotencyKey: input.requestKey,
      });
    case 'payment_execute':
      return engine.executePayment(agent, { orderId: input.orderId, mandateId: input.mandateId });
    case 'order_get':
      return engine.getOrder(agent, input.orderId);
    default:
      throw new PaymentError('invalid_command', 400);
  }
}
