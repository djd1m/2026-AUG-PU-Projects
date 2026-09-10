import { describe, it, expect, vi } from 'vitest';
import { dispatchCommand } from '../src/lib/agent-payments/commands';
import {
  gatewayAuthority,
  agentAuthority,
  humanCsrf,
  csrf,
  enabled,
} from '../src/lib/agent-payments/security';
import type { PaymentsEngine } from '@course/agent-payments';

describe('agent command authorization and transport boundary', () => {
  it('is disabled by default and gateway key never supplies buyer authority', () => {
    delete process.env.AGENT_PAYMENTS_ENABLED;
    expect(enabled()).toBe(false);
    process.env.AGENT_GATEWAY_SECRET = 's'.repeat(32);
    const req = new Request('https://proofwall.test', {
      headers: { 'x-agent-gateway-key': 's'.repeat(32) },
    });
    expect(() => gatewayAuthority(req)).not.toThrow();
    expect(() => agentAuthority(req)).toThrow('BUYER_UNAUTHORIZED');
    expect(() => gatewayAuthority(new Request(req.url))).toThrow('GATEWAY_UNAUTHORIZED');
  });
  it('rejects command extras and scope/price injection before engine access', async () => {
    const factory = vi.fn();
    const req = new Request('https://proofwall.test', {
      headers: { authorization: `Bearer ${'g'.repeat(43)}` },
    });
    for (const input of [
      { productId: 'paid', buyerId: 'foreign' },
      { productId: 'paid', amountMinor: '1' },
    ]) {
      await expect(dispatchCommand(req, { command: 'offer_get', input }, factory)).rejects.toThrow(
        'INVALID_INPUT',
      );
    }
    expect(factory).not.toHaveBeenCalled();
  });
  it('passes exact bearer audience and translates requestKey to core idempotencyKey', async () => {
    delete process.env.AGENT_PAYMENTS_AUDIENCE;
    const createOrder = vi.fn().mockResolvedValue({ orderId: 'result' });
    const req = new Request('https://proofwall.test', {
      headers: { authorization: `Bearer ${'g'.repeat(43)}` },
    });
    const quoteId = '11111111-1111-4111-8111-111111111111';
    await dispatchCommand(
      req,
      { command: 'order_create', input: { quoteId, requestKey: 'request-1' } },
      () => ({ createOrder }) as unknown as PaymentsEngine,
    );
    expect(createOrder).toHaveBeenCalledWith(
      { token: 'g'.repeat(43), audience: 'proofwall-agent-api', merchantId: 'proofwall' },
      { quoteId, idempotencyKey: 'request-1' },
    );
  });
  it('rejects wrong/missing origin and CSRF bound to another browser session', () => {
    process.env.BASE_URL = 'https://proofwall.test';
    process.env.SESSION_SECRET = 'session-test-secret-with-more-than-16';
    const auth = { accountId: 'buyer', sessionHash: 'session-a' };
    const req = (origin: string, token: string) =>
      new Request('https://proofwall.test', { headers: { origin, 'x-csrf-token': token } });
    expect(() => humanCsrf(req('https://evil.test', csrf(auth)), auth)).toThrow('CSRF_REJECTED');
    expect(() =>
      humanCsrf(req('https://proofwall.test', csrf({ ...auth, sessionHash: 'session-b' })), auth),
    ).toThrow('CSRF_REJECTED');
    expect(() => humanCsrf(req('https://proofwall.test', csrf(auth)), auth)).not.toThrow();
  });
});
