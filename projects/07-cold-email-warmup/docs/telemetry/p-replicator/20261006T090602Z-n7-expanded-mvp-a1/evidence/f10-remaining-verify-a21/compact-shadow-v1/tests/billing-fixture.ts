import { randomBytes,randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { BillingService } from '../src/billing/service.js';
import { LocalProvider } from '../src/billing/provider.js';
// Explicit TEST team capacity for older dispatch fixtures; assertions/guards unchanged.
export async function seedTestEntitlement(pool:Pool,tenant:string) {
 const billing=new BillingService(pool,randomBytes(32),'local_test');
 const intent=await billing.checkout(tenant,{plan:'team',idempotencyKey:randomUUID()});
 await new LocalProvider(pool,'local_test').simulate(intent.payment_id,{status:'succeeded'});
 await billing.reconcile(intent.id);
}
