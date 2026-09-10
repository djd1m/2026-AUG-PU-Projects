export type * from './contracts.js';
export { PostgresStore, migrate, lockBuyer } from './store.js';
export { PaymentError } from './internal.js';
import type { EngineOptions, PaymentsEngine } from './contracts.js';
import { Context } from './internal.js';
import { authority } from './authority.js';
import { orders } from './orders.js';
import { execution } from './execution.js';
import { reconciliation } from './settlement.js';
import { observeHumanSpend } from './budget.js';
export { observeHumanSpend };
export function createPaymentsEngine(options: EngineOptions): PaymentsEngine {
  const context = new Context(options);
  return {
    ...authority(context),
    ...orders(context),
    ...execution(context),
    ...reconciliation(context),
    observeHumanSpend,
  };
}
