import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {PgDesigns,PgJobs} from '@n8/db/design';
import {freshDb} from '../helpers/db';
import {setup,revision,live} from '../design/fixtures';
import {account,counts,services,signal,offer} from './fixtures';
let db:Awaited<ReturnType<typeof freshDb>>;
beforeEach(async()=>{db=await freshDb();});afterEach(async()=>{await db.close();});
it('AC-billing-6 partial refund distinct object verified via payment_id; replay cannot restore export or new billing',async()=>{
 const actor=await account(db.pool),{service,provider,store}=services(db.pool);const order=await service.checkout(actor,randomUUID(),{sku:'room'});const payment=provider.succeed([...provider.payments.keys()][0]);await service.notification(signal(payment.id));const refund=provider.refund(payment.id,1);
 const results=await Promise.all(Array.from({length:12},()=>service.notification(signal(refund.id,'refund.succeeded'))));expect(results.filter(x=>x.outcome==='applied')).toHaveLength(1);
 expect(await counts(db.pool,actor)).toEqual({credits_available:10,paid_export:false,billing_hold:true,events:2,orders:1});expect((await store.get(actor,order.id)).state).toBe('refund_hold');
 await service.notification(signal(payment.id));expect((await counts(db.pool,actor)).paid_export).toBe(false);await expect(service.checkout(actor,randomUUID(),{sku:'room'})).rejects.toMatchObject({code:'BILLING_HOLD'});
});
it('refund before late payment succeeds is monotonic; success audited ignored with zero credits',async()=>{
 const actor=await account(db.pool),{service,provider}=services(db.pool);await service.checkout(actor,randomUUID(),{sku:'room'});const payment=provider.succeed([...provider.payments.keys()][0]);const refund=provider.refund(payment.id,offer.priceMinor);
 await service.notification(signal(refund.id,'refund.succeeded'));expect(await service.notification(signal(payment.id))).toEqual({outcome:'ignored'});
 expect(await counts(db.pool,actor)).toEqual({credits_available:0,paid_export:false,billing_hold:true,events:2,orders:1});expect((await db.pool.query("SELECT count(*)::int n FROM audit_event WHERE kind='payment_ignored'")).rows[0].n).toBe(1);
});
it('parallel success/refund always ends in durable hold, never duplicate credits',async()=>{
 const actor=await account(db.pool),{service,provider}=services(db.pool);await service.checkout(actor,randomUUID(),{sku:'room'});const payment=provider.succeed([...provider.payments.keys()][0]);const refund=provider.refund(payment.id);
 await Promise.all(Array.from({length:16},(_,i)=>service.notification(signal(i%2?refund.id:payment.id,i%2?'refund.succeeded':'payment.succeeded'))));
 const result=await counts(db.pool,actor);expect(result).toMatchObject({billing_hold:true,paid_export:false,events:2});expect([0,10]).toContain(result.credits_available);expect((await db.pool.query('SELECT state FROM payment_order')).rows[0].state).toBe('refund_hold');
});
it('refund rejects nonpositive/excess/currency/unpaid/original-link proofs without occupying ledger',async()=>{
 const actor=await account(db.pool),{service,provider}=services(db.pool);await service.checkout(actor,randomUUID(),{sku:'room'});const payment=provider.succeed([...provider.payments.keys()][0]);const refund=provider.refund(payment.id);
 for(const change of [{amountMinor:0},{amountMinor:-1},{amountMinor:offer.priceMinor+1},{currency:'USD' as 'RUB'},{status:'pending' as 'succeeded'}]){
  const saved={...refund};Object.assign(refund,change);await expect(service.notification(signal(refund.id,'refund.succeeded'))).rejects.toMatchObject({status:400});Object.assign(refund,saved);
 }
 payment.paid=false;await expect(service.notification(signal(refund.id,'refund.succeeded'))).rejects.toMatchObject({status:400});payment.paid=true;
 payment.orderId=randomUUID();await expect(service.notification(signal(refund.id,'refund.succeeded'))).rejects.toMatchObject({status:400});expect((await counts(db.pool,actor)).events).toBe(0);
});
it('refund atomically revokes existing unwatermarked shares while watermarked snapshot remains; failure rolls back hold/revoke/event',async()=>{
 const f=await setup(db.pool),{service,provider}=services(db.pool);await service.checkout(f.actor,randomUUID(),{sku:'room'});const payment=provider.succeed([...provider.payments.keys()][0]);await service.notification(signal(payment.id));
 const designs=new PgDesigns(db.pool),design=(await designs.create(f.actor,f.project,1,revision(f.scene))).design;
 const links:string[]=[];for(const watermarked of [false,true]){const asset=randomUUID(),link=randomUUID();links.push(link);await db.pool.query(`INSERT INTO asset(id,project_id,kind,original_key,normalized_key,original_hash,mime,bytes,rights_confirmed,state,stored_bytes,metadata) VALUES($1,$2,'share_image',$3,$4,$5,'image/png',100,true,'ready',100,$6)`,[asset,f.project,asset,`${asset}-normalized`,'a'.repeat(64),{watermarked,designId:design.id}]);await db.pool.query("INSERT INTO share_link(id,project_id,design_id,asset_id,token_hash,caption,expires_at) VALUES($1,$2,$3,$4,$5,'Комната',now()+interval '1 day')",[link,f.project,design.id,asset,link]);}
 const refund=provider.refund(payment.id);await db.pool.query("CREATE FUNCTION reject_revoke() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture revoke failure'; END $$; CREATE TRIGGER reject_revoke BEFORE UPDATE ON share_link FOR EACH ROW EXECUTE FUNCTION reject_revoke()");
 await expect(service.notification(signal(refund.id,'refund.succeeded'))).rejects.toThrow('fixture revoke failure');expect(await counts(db.pool,f.actor)).toMatchObject({billing_hold:false,paid_export:true,events:1});expect((await db.pool.query('SELECT state FROM payment_order')).rows[0].state).toBe('succeeded');
 await db.pool.query('DROP TRIGGER reject_revoke ON share_link');await service.notification(signal(refund.id,'refund.succeeded'));const rows=(await db.pool.query('SELECT id,revoked_at FROM share_link')).rows;expect(rows.find(x=>x.id===links[0]).revoked_at).toBeInstanceOf(Date);expect(rows.find(x=>x.id===links[1]).revoked_at).toBeNull();
});
it('refund before actual PgJobs dispatch mark releases held admission and prevents external dispatch',async()=>{
 const f=await setup(db.pool),{service,provider}=services(db.pool);await service.checkout(f.actor,randomUUID(),{sku:'room'});const payment=provider.succeed([...provider.payments.keys()][0]);await service.notification(signal(payment.id));
 const jobs=new PgJobs(db.pool,{aiMode:'live',aiLive:live});const preview=await jobs.preview(f.actor,f.project,1,f.input);const job=await jobs.submit(f.actor,f.project,1,randomUUID(),f.input,preview.consentHash);const claim=await jobs.claim('billing-test');expect(claim!.id).toBe(job.id);
 const refund=provider.refund(payment.id);await service.notification(signal(refund.id,'refund.succeeded'));expect(await jobs.markDispatched(claim!)).toBe(false);
 const row=(await db.pool.query('SELECT state,request_dispatched_at,credit_state FROM job WHERE id=$1',[job.id])).rows[0];expect(row).toEqual({state:'failed',request_dispatched_at:null,credit_state:'released'});
 expect((await db.pool.query('SELECT credits_available,credits_held FROM account WHERE id=$1',[f.actor])).rows[0]).toEqual({credits_available:40,credits_held:0});
 await expect(jobs.preview(f.actor,f.project,1,f.input)).rejects.toMatchObject({code:'BILLING_HOLD'});
});
it('refund after dispatch mark leaves in-flight held job visible; no false cancellation or inline spend-lock settlement',async()=>{
 const f=await setup(db.pool),{service,provider}=services(db.pool);await service.checkout(f.actor,randomUUID(),{sku:'room'});const payment=provider.succeed([...provider.payments.keys()][0]);await service.notification(signal(payment.id));
 const jobs=new PgJobs(db.pool,{aiMode:'live',aiLive:live});const preview=await jobs.preview(f.actor,f.project,1,f.input);await jobs.submit(f.actor,f.project,1,randomUUID(),f.input,preview.consentHash);const claim=await jobs.claim('billing-test');expect(await jobs.markDispatched(claim!)).toBe(true);
 const refund=provider.refund(payment.id);await service.notification(signal(refund.id,'refund.succeeded'));const row=(await db.pool.query('SELECT state,request_dispatched_at,credit_state FROM job WHERE id=$1',[claim!.id])).rows[0];expect(row.state).toBe('running');expect(row.request_dispatched_at).toBeInstanceOf(Date);expect(row.credit_state).toBe('held');expect((await db.pool.query('SELECT credits_held FROM account WHERE id=$1',[f.actor])).rows[0].credits_held).toBe(1);
});
