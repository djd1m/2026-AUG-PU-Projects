// Operator-only recovery for an existing TEST payment after a missed notification.
// Run inside the P1 backend; never expose this as a public endpoint.
import { bridgeNotification } from '../apps/web/src/lib/n3-payment';
import { closePool } from '../packages/db/src/index';

async function main() {
  try {
    const paymentId = process.argv[2];
    if (process.argv.length !== 3 || !/^[a-f0-9-]{36}$/.test(paymentId ?? '')) throw new Error('Invalid payment ID');
    // Uses the same authoritative provider GET, persisted invoice binding,
    // transactional tariff/outbox writes and duplicate protection as the webhook.
    const status = await bridgeNotification('payment.succeeded', paymentId);
    if (status !== 'upgraded') throw new Error('Not a verified bridge payment');
    console.log(JSON.stringify({ reconciled: true, paymentId, status }));
  } catch {
    console.error('Payment reconciliation failed; no secrets or provider body logged.');
    process.exitCode = 1;
  } finally { await closePool(); }
}
void main();
