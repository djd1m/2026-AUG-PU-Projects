import type { PaymentsEngine } from '@course/agent-payments';
import { startPairing, pairingStatus } from './identity';
import { agentAuthority, fields, string, uuid, AgentHostError } from './security';
export async function dispatchCommand(
  request: Request,
  envelope: unknown,
  engine: () => PaymentsEngine,
) {
  fields(envelope, ['command', 'input']);
  const command = string(envelope.command),
    input = envelope.input;
  const clientKey = request.headers.get('x-agent-client-key') || '';
  const key = /^[a-f0-9]{64}$/.test(clientKey) ? clientKey : 'gateway';
  switch (command) {
    case 'buyer_link_start':
      fields(input, ['displayName', 'audience']);
      return startPairing(string(input.displayName, 100), string(input.audience), key);
    case 'buyer_link_status':
      fields(input, ['pairingId', 'pollToken']);
      return pairingStatus(uuid(input.pairingId), string(input.pollToken, 43), key);
    case 'offer_get': {
      const agent = agentAuthority(request);
      fields(input, ['productId']);
      return engine().getOffer(agent, string(input.productId));
    }
    case 'order_create': {
      const agent = agentAuthority(request);
      fields(input, ['quoteId', 'requestKey']);
      return engine().createOrder(agent, {
        quoteId: uuid(input.quoteId),
        idempotencyKey: string(input.requestKey),
      });
    }
    case 'payment_execute': {
      const agent = agentAuthority(request);
      fields(input, ['orderId', 'mandateId'], ['orderId']);
      return engine().executePayment(agent, {
        orderId: uuid(input.orderId),
        ...(input.mandateId ? { mandateId: uuid(input.mandateId) } : {}),
      });
    }
    case 'order_get': {
      const agent = agentAuthority(request);
      fields(input, ['orderId']);
      return engine().getOrder(agent, uuid(input.orderId));
    }
    default:
      throw new AgentHostError('UNKNOWN_COMMAND');
  }
}
