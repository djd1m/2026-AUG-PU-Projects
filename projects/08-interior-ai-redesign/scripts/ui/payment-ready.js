// LOCAL SOFTWARE FIXTURE ONLY. No browser, provider or PostgreSQL acceptance proof.
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {requireUuid} from '../../web/boundaries.js';
import {createPayments} from '../../web/payments.js';
import {createFixtureProvider} from '../../web/payment-fixture.js';
import {fixtureSignal} from '../payment-fixture.js';

export async function driveFixturePayment(pool,config,id,{
  runOne,signal=fixtureSignal,
  now=()=>performance.now(),sleep=delay
}={}) {
  // Keep the runtime/mode guard ahead of all injected local-test operations.
  createFixtureProvider(pool,config);requireUuid(id);
  const payments=createPayments(pool,config),advance=runOne??(()=>payments.runOne());
  const deadline=now()+10000;
  async function ready() {
    const p=(await pool.query('SELECT id,status,provider_id,provider_mode FROM payment_intent WHERE id=$1',[id])).rows[0];
    if(!p)throw new Error('fixture_payment_missing');
    if(p.id!==id||p.provider_mode!=='fixture')throw new Error('fixture_payment_binding_invalid');
    if(!['created','pending'].includes(p.status))throw new Error('fixture_payment_terminal:'+p.status);
    return p.status==='pending'&&Boolean(p.provider_id);
  }
  for(let attempt=0;attempt<100&&now()<deadline;attempt++) {
    if(await ready()) {
      if(now()>=deadline)break;
      await signal(pool,config,id,'success');return {software_fixture:true};
    }
    // A false result is normal while the server owns the target lease. Never
    // clear that lease or attach a provider ID from another queue candidate.
    if(now()>=deadline)break;
    await advance();
    if(now()>=deadline)break;
    if(await ready()) {
      if(now()>=deadline)break;
      await signal(pool,config,id,'success');return {software_fixture:true};
    }
    if(attempt<99)await sleep(Math.min(50,Math.max(0,deadline-now())));
  }
  throw new Error('fixture_payment_readiness_exhausted');
}
