import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { seed, bound, cleanup, withService, pool, rollback } from './helpers/n3-fixture';
import { reserveNativeIntent, saveNativeSession } from '../src/lib/n3-checkout';
import { applyBridgePayment, validateBridgePayment, bridgeNotification } from '../src/lib/n3-payment';
import { applyTariffUpgrade } from '../src/lib/payment';

afterAll(cleanup);
async function purchase(a: Awaited<ReturnType<typeof seed>>) {
  const intent = await withService(c => reserveNativeIntent(c,a.accountId,a.projectId,randomUUID()));
  const orderId = randomUUID();
  await withService(c => c.query('update n3_checkout_intents set order_id=$2 where id=$1', [intent.id,orderId]));
  return { intent, payment: { id:`pay-${intent.id}`,status:'succeeded' as const,paid:true,amount:990,currency:'RUB',test:true,shopId:'fixture-shop',
    metadata: { project_id:a.projectId,proofwall_invoice_id:intent.id,order_id:orderId } } };
}
describe('N3 native payment and refunds', () => {
  it('early webhook recovers native session and duplicate expiry is exactly unchanged', async () => {
    const a = await seed(); await bound(a.accountId,a.email); const { intent,payment } = await purchase(a);
    expect(await withService(c => applyBridgePayment(c,payment,'payment.succeeded'))).toBe('upgraded');
    const until = (await withService(c => c.query('select paid_until from projects where id=$1', [a.projectId]))).rows[0].paid_until.toISOString();
    await withService(c => applyBridgePayment(c,payment,'payment.succeeded'));
    await withService(c => applyTariffUpgrade(c,payment.id));
    const next = (await withService(c => c.query('select paid_until from projects where id=$1', [a.projectId]))).rows[0].paid_until.toISOString();
    expect(next).toBe(until);
    const current = (await withService(c => c.query('select * from n3_checkout_intents where id=$1', [intent.id]))).rows[0];
    await withService(c => saveNativeSession(c,current,{ providerSessionId:payment.id,redirectUrl:'https://yookassa.test/confirmed' }));
    expect((await withService(c => c.query('select state from n3_checkout_intents where id=$1', [intent.id]))).rows[0].state).toBe('completed');
    expect((await withService(c => c.query('select * from n3_bridge_outbox where account_id=$1', [a.accountId]))).rows).toHaveLength(1);
  });
  it('two distinct concurrent native payments add two complete periods', async () => {
    const a = await seed(); await bound(a.accountId,a.email);
    // Seed two already-created native sessions under the owner role. This verifies
    // the shared tariff helper for both legacy and bridge payment sources.
    const ids = [randomUUID(),randomUUID()];
    const { withAccount } = await import('@proofwall/db');
    await withAccount(a.accountId,c => c.query("insert into checkout_sessions(project_id,provider_session_id) values($1,$2),($1,$3)",[a.projectId,...ids]));
    const start = Date.now();
    await Promise.all(ids.map(id => withService(c => applyTariffUpgrade(c,id))));
    const until = (await withService(c => c.query('select paid_until from projects where id=$1',[a.projectId]))).rows[0].paid_until.getTime();
    expect(until-start).toBeGreaterThanOrEqual(60*86400000-1000);
    expect(until-start).toBeLessThan(60*86400000+10000);
  });
  it('refund before payment relay applies once and creates explicit manual review', async () => {
    const a = await seed(); await bound(a.accountId,a.email); const { intent,payment } = await purchase(a);
    const refund = { id:randomUUID(),paymentId:payment.id,amountMinor:33000 };
    await withService(c => applyBridgePayment(c,payment,'refund.succeeded',refund));
    const expiry = (await withService(c => c.query('select paid_until from projects where id=$1',[a.projectId]))).rows[0].paid_until.toISOString();
    await withService(c => applyBridgePayment(c,payment,'refund.succeeded',refund));
    const rows = (await withService(c => c.query('select * from n3_refund_reviews where intent_id=$1',[intent.id]))).rows;
    expect(rows).toHaveLength(1); expect(rows[0].status).toBe('manual_review');
    expect((await withService(c => c.query('select paid_until from projects where id=$1',[a.projectId]))).rows[0].paid_until.toISOString()).toBe(expiry);
    expect((await withService(c => c.query('select * from n3_bridge_outbox where account_id=$1',[a.accountId]))).rows).toHaveLength(2);
    await expect(withService(c => applyBridgePayment(c,payment,'refund.succeeded',{ ...refund,id:randomUUID(),amountMinor:99000 }))).rejects.toMatchObject({ code:'N3_REFUND_EXCESS' });
  });
  it('mismatched amount shop test mode and foreign invoice never apply entitlement', async () => {
    const a = await seed(); await bound(a.accountId,a.email); const { payment } = await purchase(a);
    for (const change of [{ amount:1 },{ currency:'USD' },{ test:false },{ shopId:'foreign' },{ id:'other' }]) {
      expect(() => validateBridgePayment({ ...payment,...change },payment.id)).toThrow();
    }
    await expect(withService(c => applyBridgePayment(c,{ ...payment,metadata:{ ...payment.metadata,project_id:randomUUID() } },'payment.succeeded'))).rejects.toMatchObject({ code:'N3_PAYMENT_BINDING' });
    expect((await withService(c => c.query('select paid_until from projects where id=$1',[a.projectId]))).rows[0].paid_until).toBeNull();
  });
  it('refund HTTP verification fetches original payment and rejects forged provider facts before dedup', async () => {
    const a=await seed();await bound(a.accountId,a.email);const {payment}=await purchase(a),refundId=randomUUID();
    process.env.YOOKASSA_SECRET_KEY='isolated-test-only';
    const urls:string[]=[];let wrongShop=true;
    vi.stubGlobal('fetch',async(url:unknown)=>{
      urls.push(String(url));
      if(String(url).includes('/refunds/'))return new Response(JSON.stringify({id:refundId,payment_id:payment.id,status:'succeeded',amount:{value:'330.00',currency:'RUB'}}));
      return new Response(JSON.stringify({...payment,recipient:{account_id:wrongShop?'foreign':'fixture-shop'},amount:{value:'990.00',currency:'RUB'}}));
    });
    try {
      await expect(bridgeNotification('refund.succeeded',refundId)).rejects.toMatchObject({code:'N3_PAYMENT_UNVERIFIED'});
      expect((await withService(c=>c.query('select 1 from webhook_events where event_id=$1',[`refund.succeeded:${refundId}`]))).rowCount).toBe(0);
      wrongShop=false;expect(await bridgeNotification('refund.succeeded',refundId)).toBe('refund_manual_review');
      expect(urls.filter(url=>url.endsWith(`/refunds/${refundId}`))).toHaveLength(2);
      expect(urls.filter(url=>url.endsWith(`/payments/${payment.id}`))).toHaveLength(2);
    }finally{vi.unstubAllGlobals();}
  });
  it('full queue failure rolls back tariff and webhook claim and retry stays available', async()=>{
    const a=await seed();await bound(a.accountId,a.email);const {payment}=await purchase(a);
    await rollback(async c=>{
      const count=(await c.query('select count(*)::int as n from n3_bridge_outbox where delivered_at is null')).rows[0].n;
      await c.query(`insert into n3_bridge_outbox(account_id,kind,business_key,payload)
        select $1,'payment.succeeded',gen_random_uuid()::text,'{}'::jsonb from generate_series(1,$2::int)`,[a.accountId,10000-count]);
      await c.query('savepoint capacity');
      await expect(applyBridgePayment(c,payment,'payment.succeeded')).rejects.toMatchObject({code:'N3_QUEUE_FULL'});
      await c.query('rollback to savepoint capacity');
      expect((await c.query('select paid_until from projects where id=$1',[a.projectId])).rows[0].paid_until).toBeNull();
      expect((await c.query('select 1 from webhook_events where event_id=$1',[`payment.succeeded:${payment.id}`])).rowCount).toBe(0);
    });
    expect(await withService(c=>applyBridgePayment(c,payment,'payment.succeeded'))).toBe('upgraded');
    expect((await pool.query('select paid_until from projects where id=$1',[a.projectId])).rows[0].paid_until).not.toBeNull();
  });
});
