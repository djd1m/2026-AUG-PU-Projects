import { pool } from '@proofwall/db';
import { createPaymentsEngine, PostgresStore, type PaymentsEngine } from '@course/agent-payments';
import { YooKassaTestProvider } from '@course/agent-payments/provider-yookassa';
import { proofwallHost, providerMetadata } from './host';
import { AgentHostError, requireEnabled } from './security';
let cached: PaymentsEngine | undefined;
export function paymentEngine(): PaymentsEngine {
  requireEnabled();
  return reconciliationEngine();
}
/** Existing dispatched orders remain recoverable when new issuance is disabled. */
export function reconciliationEngine(): PaymentsEngine {
  if (cached) return cached;
  const shopId = process.env.AGENT_YOOKASSA_TEST_SHOP_ID,
    secretKey = process.env.AGENT_YOOKASSA_TEST_SECRET_KEY;
  if (!shopId || !secretKey || !secretKey.startsWith('test_'))
    throw new AgentHostError('TEST_PROVIDER_NOT_CONFIGURED', 503);
  cached = createPaymentsEngine({
    store: new PostgresStore(pool),
    host: proofwallHost,
    provider: new YooKassaTestProvider({ shopId, secretKey, metadataFor: providerMetadata }),
  });
  return cached;
}
