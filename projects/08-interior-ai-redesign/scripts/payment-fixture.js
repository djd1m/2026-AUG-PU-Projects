import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readConfig } from '../web/config.js';
import { createPool } from '../web/db.js';
import { createPayments } from '../web/payments.js';
import { createFixtureProvider } from '../web/payment-fixture.js';
import { requireUuid } from '../web/boundaries.js';
// Server-only local operator helper. No HTTP setter, no production fixture, no refund API call.
export async function fixtureSignal(pool,config,intentId,action) {
  createFixtureProvider(pool,config);requireUuid(intentId);
  if(!['success','cancel','refund'].includes(action))throw new Error('Unknown fixture action');
  const p=(await pool.query("SELECT * FROM payment_intent WHERE id=$1 AND provider_mode='fixture'",[intentId])).rows[0];
  if(!p?.provider_id)throw new Error('Run asynchronous checkout creation first');
  const payments=createPayments(pool,config);
  if(action==='refund') {
    const id=randomUUID();
    await pool.query(`INSERT INTO payment_fixture_object(kind,id,body) VALUES('refund',$1,$2)`,[id,
      JSON.stringify({id,payment_id:p.provider_id,status:'succeeded',amount:{value:'900.00',currency:'RUB'}})]);
    return payments.notify({event:'refund.succeeded',object:{id}});
  }
  await pool.query(`UPDATE payment_fixture_object SET body=body || $2::jsonb WHERE kind='payment' AND id=$1`,[p.provider_id,
    JSON.stringify({status:action==='success'?'succeeded':'canceled',paid:action==='success'})]);
  return payments.notify({event:action==='success'?'payment.succeeded':'payment.canceled',object:{id:p.provider_id}});
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  let pool;
  try {const config=readConfig();createFixtureProvider({},config);pool=createPool(config.databaseUrl);
    await fixtureSignal(pool,config,process.argv[2],process.argv[3]);console.log('fixture_verified_signal_processed');}
  catch {console.error('fixture_signal_failed');process.exitCode=1;}finally {await pool?.end();}
}
