import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { seed, bound, cleanup, withService } from './helpers/n3-fixture';
import { beginN3Checkout, reserveNativeIntent } from '../src/lib/n3-checkout';
import { externalOrderResult, n3Client } from '../src/lib/n3-runtime';

afterAll(cleanup);
describe('N3 native checkout durability', () => {
  it('external intent precedes native create and retry reuses exact invoice', async () => {
    const a = await seed(); await bound(a.accountId, a.email);
    const orderId = randomUUID(), key = randomUUID(), seen: string[] = [];
    let invoice = '';
    const deps = {
      call: async () => {
        const stored = (await withService(c => c.query('select id,order_id from n3_checkout_intents where account_id=$1', [a.accountId]))).rows[0];
        invoice = stored.id; expect(stored.order_id).toBeNull(); seen.push('reserve');
        return { orderId, amountMinor: 99000, currency: 'RUB', testMode: true };
      },
      create: async (_p: string, amount: number, _url: string, idem: string, metadata?: { order_id: string; proofwall_invoice_id: string }) => {
        expect(amount).toBe(990); expect(idem).toBe(invoice); expect(metadata).toEqual({ order_id: orderId, proofwall_invoice_id: invoice });
        expect((await withService(c => c.query('select order_id from n3_checkout_intents where id=$1', [invoice]))).rows[0].order_id).toBe(orderId);
        seen.push('create'); return { providerSessionId: `pay-${invoice}`, redirectUrl: 'https://yookassa.test/pay' };
      },
    };
    const first = await beginN3Checkout(a.accountId, a.projectId, 'https://proofwall.test/', key, deps);
    expect(await beginN3Checkout(a.accountId, a.projectId, 'https://proofwall.test/', key, deps)).toEqual(first);
    expect(seen).toEqual(['reserve','create']);
    const sessions = (await withService(c => c.query('select * from checkout_sessions where project_id=$1', [a.projectId]))).rows;
    expect(sessions).toHaveLength(1); expect(sessions[0].idempotence_key).toBe(invoice);
  });
  it('timeout retains stable native idempotence key and 23h ambiguity refuses new create', async () => {
    const a = await seed(); await bound(a.accountId, a.email); const keys: string[] = [], key = randomUUID();
    const deps = { call: async () => ({ orderId: randomUUID(), amountMinor: 99000, currency: 'RUB', testMode: true }),
      create: async (_p: string, _a: number, _u: string, k: string) => { keys.push(k); throw new Error('lost response'); } };
    await expect(beginN3Checkout(a.accountId,a.projectId,'https://proofwall.test/',key,deps)).rejects.toThrow('lost response');
    await expect(beginN3Checkout(a.accountId,a.projectId,'https://proofwall.test/',key,deps)).rejects.toThrow('lost response');
    expect(keys[0]).toBe(keys[1]);
    await withService(c => c.query("update n3_checkout_intents set created_at=now()-interval '24 hours' where account_id=$1", [a.accountId]));
    await expect(beginN3Checkout(a.accountId,a.projectId,'https://proofwall.test/',key,deps)).rejects.toMatchObject({ code: 'N3_RECONCILIATION' });
    expect(keys).toHaveLength(2);
  });
  it('completed early webhook recovers directly without replaying provider create even after 23h', async () => {
    const a = await seed(); await bound(a.accountId, a.email); const key = randomUUID();
    const intent = await withService(c => reserveNativeIntent(c,a.accountId,a.projectId,key));
    await withService(c => c.query(`update n3_checkout_intents set state='completed',provider_id=$2,
      order_id=$3,created_at=now()-interval '24 hours' where id=$1`, [intent.id,`pay-${intent.id}`,randomUUID()]));
    let calls = 0;
    const result = await beginN3Checkout(a.accountId,a.projectId,'https://proofwall.test/dashboard/own',key, {
      call: async () => { calls++; throw new Error('unexpected N3 IO'); },
      create: async () => { calls++; throw new Error('unexpected provider IO'); },
    });
    expect(result).toEqual({ providerSessionId:`pay-${intent.id}`,redirectUrl:'https://proofwall.test/dashboard/own' });
    expect(calls).toBe(0);
  });
  it('unverified and unacknowledged customer cannot create invoice and foreign project refuses', async () => {
    const a = await seed(), b = await seed();
    await expect(withService(c => reserveNativeIntent(c,a.accountId,a.projectId,randomUUID()))).rejects.toMatchObject({ code: 'N3_PROOF_REQUIRED' });
    await withService(c => c.query('insert into n3_email_proofs(account_id,id,email) values($1,$2,$3)', [a.accountId,randomUUID(),a.email]));
    await expect(withService(c => reserveNativeIntent(c,a.accountId,a.projectId,randomUUID()))).rejects.toMatchObject({ code: 'N3_BIND_PENDING' });
    await expect(withService(c => reserveNativeIntent(c,a.accountId,b.projectId,randomUUID()))).rejects.toMatchObject({ code: 'N3_PROJECT' });
  });
  it('wrong order response and bare response envelope cannot authorize provider create', async () => {
    expect(() => externalOrderResult({ orderId:randomUUID(),amountMinor:99000,currency:'USD',testMode:true })).toThrow();
    expect(() => externalOrderResult({ orderId:randomUUID(),amountMinor:99000,currency:'RUB',testMode:false })).toThrow();
    const call = n3Client({ baseUrl:'https://n3.test',tenantId:randomUUID(),key:'x'.repeat(43) },
      async () => new Response(JSON.stringify({ orderId:randomUUID() })));
    await expect(call('external-orders',{})).rejects.toMatchObject({ code: 'N3_RESPONSE' });
  });
  it('canceled first purchase requires explicit new key while unresolved retry cannot create another invoice', async () => {
    const a=await seed();await bound(a.accountId,a.email);const oldKey=randomUUID(),newKey=randomUUID();let calls=0;
    const deps={call:async()=>{calls++;return {orderId:randomUUID(),amountMinor:99000,currency:'RUB',testMode:true};},
      create:async(_p:string,_a:number,_url:string,key:string)=>({providerSessionId:`pay-${key}`,redirectUrl:`https://yookassa.test/${key}`})};
    const original=await beginN3Checkout(a.accountId,a.projectId,'https://proofwall.test/',oldKey,deps);
    expect(await beginN3Checkout(a.accountId,a.projectId,'https://proofwall.test/',newKey,deps)).toEqual(original);
    expect(calls).toBe(1);
    await withService(c=>c.query("update n3_checkout_intents set state='canceled' where account_id=$1",[a.accountId]));
    await expect(beginN3Checkout(a.accountId,a.projectId,'https://proofwall.test/',oldKey,deps)).rejects.toMatchObject({code:'N3_PAYMENT_CANCELED',status:409});
    const next=await beginN3Checkout(a.accountId,a.projectId,'https://proofwall.test/',newKey,deps);
    expect(next?.providerSessionId).not.toBe(original?.providerSessionId);expect(calls).toBe(2);
    expect((await withService(c=>c.query('select paid_until from projects where id=$1',[a.projectId]))).rows[0].paid_until).toBeNull();
    expect((await withService(c=>c.query('select id from n3_checkout_intents where account_id=$1',[a.accountId]))).rows).toHaveLength(2);
  });
});
