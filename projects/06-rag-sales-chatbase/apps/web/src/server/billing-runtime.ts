// Связка маршрутов оплаты: зависимости собираются ОДИН раз на процесс (как getCabinetDependencies).
import { createBillingDependencies } from './billing-deps';
import type { BillingDependencies } from './billing-handler';
import { allowMutation } from './rate-limit';
import { getRuntime } from './runtime';

const billingGlobal = globalThis as typeof globalThis & { n6Billing?: BillingDependencies };
export function getBillingDependencies(): BillingDependencies {
  return billingGlobal.n6Billing ??= (() => {
    const { pool, redis, auth, config, payments } = getRuntime();
    return createBillingDependencies({
      pool, publicOrigin: config.publicOrigin, provider: payments,
      allowMutation: (ip, account) => allowMutation(redis, ip, config.sessionSecret, account),
      authenticate: (token) => auth.authenticate(token),
    });
  })();
}
