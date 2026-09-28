// из N6: projects/06-rag-sales-chatbase/apps/web/src/server/billing-runtime.ts — адаптировано (фича 30 payments):
// зависимости маршрутов оплаты собираются ОДИН раз на процесс из рантайма N5.
import { createBillingDependencies } from './billing-deps';
import type { BillingDependencies } from './billing-handler';
import { allowMutation, allowRead } from './rate-limit';
import { getRuntime } from './runtime';

const billingGlobal = globalThis as typeof globalThis & { n5Billing?: BillingDependencies };
export function getBillingDependencies(): BillingDependencies {
  return billingGlobal.n5Billing ??= (() => {
    const { pool, redis, auth, config, payments } = getRuntime();
    return createBillingDependencies({
      pool, publicOrigin: config.publicOrigin, trustedProxyHops: config.trustedProxyHops, provider: payments,
      allowMutation: (ip, account) => allowMutation(redis, ip, config.sessionSecret, account),
      allowRead: (ip, account) => allowRead(redis, ip, config.sessionSecret, account),
      authenticate: (token) => auth.authenticate(token),
    });
  })();
}
