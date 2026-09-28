// из N6: projects/06-rag-sales-chatbase/apps/web/src/server/billing-deps.ts — адаптировано (фича 30 payments): без интереса
// (в N5 он tRPC), плюс число доверенных хопов и ограничитель чтений N5. Одна функция для маршрутов и для тестов
// (tests/billing.integration.test.ts): тест подменяет только провайдера и ограничитель — намерение, ключ повторности,
// план и срок идут по НАСТОЯЩЕМУ SQL.
import { applyVerifiedPayment, createPaymentIntent, markIntentCanceled, readPaymentIntent, recordVerifiedRefund,
  setIntentProviderPayment, type Pool } from '@clipmaker/db';
import type { BillingDependencies } from './billing-handler';
import type { PaymentProvider } from './payments/provider';

export interface BillingWiring {
  pool: Pool;
  publicOrigin: string;
  trustedProxyHops: number;
  provider: PaymentProvider | null;
  allowMutation: (ip: string, account?: string) => Promise<boolean>;
  allowRead: (ip: string, account?: string) => Promise<boolean>;
  authenticate: (token: string) => Promise<{ account_id: string } | null>;
  log?: (line: string) => void;
}

export function createBillingDependencies(w: BillingWiring): BillingDependencies {
  const { pool } = w;
  return {
    publicOrigin: w.publicOrigin, trustedProxyHops: w.trustedProxyHops, authenticate: w.authenticate,
    allowMutation: w.allowMutation, allowRead: w.allowRead, provider: w.provider, log: w.log,
    createIntent: (input) => createPaymentIntent(pool, input),
    setIntentPayment: (intentId, paymentId) => setIntentProviderPayment(pool, intentId, paymentId),
    readIntent: (intentId, accountId) => readPaymentIntent(pool, intentId, accountId),
    markCanceled: (intentId) => markIntentCanceled(pool, intentId),
    applyPayment: (input) => applyVerifiedPayment(pool, input),
    recordRefund: (input) => recordVerifiedRefund(pool, input),
  };
}
