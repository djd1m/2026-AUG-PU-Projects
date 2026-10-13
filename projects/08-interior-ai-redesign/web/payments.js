import { createHash,randomUUID } from 'node:crypto';
import { transaction } from './db.js';
import { HttpError,requireUuid } from './boundaries.js';
import { createAttribution,trackingCookie } from './attribution.js';
import { createJobs } from './jobs.js';
import { createProvider,PROVIDER_ID,verify,verifyPayment,verifyRefund,confirmationUrl } from './provider.js';
import { createFixtureProvider } from './payment-fixture.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
export const CREATE_WINDOW_MS=23*60*60*1000;
export function paymentInput(b) {
  if(!b || typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['package','idempotency_key','partner_code'].includes(k)) ||
    b.package!=='ROOM20'||typeof b.idempotency_key!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(b.idempotency_key)||
    (b.partner_code!==undefined && (typeof b.partner_code!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(b.partner_code)))) throw new HttpError(400,'invalid_payment');
  return {key:b.idempotency_key,code:b.partner_code,hash:hash(JSON.stringify(['ROOM20',b.partner_code??null]))};
}
export function notification(b) {
  if(!['payment.succeeded','payment.canceled','refund.succeeded'].includes(b?.event)||!PROVIDER_ID.test(b?.object?.id))throw new HttpError(400,'invalid_notification');
  return {event:b.event,id:b.object.id,kind:b.event.startsWith('refund.')?'refund':'payment'};
}
const view=p=>({payment_id:p.id,package:p.package,amount_minor:p.amount_minor,currency:p.currency,status:p.status,
  confirmation_url:p.confirmation_url,provider_mode:p.provider_mode});
export function createPayments(pool,config,{provider}={}) {
  const attribution=createAttribution(pool,config);const jobs=createJobs(pool,config);let cachedProvider;
  function adapter() {
    if(!['live','fixture'].includes(config.providerMode))throw new HttpError(503,'payments_unavailable');
    if(config.providerMode==='fixture'&&!['test','development'].includes(config.runtime))throw new HttpError(503,'payments_unavailable');
    return cachedProvider??=(provider??(config.providerMode==='fixture'?createFixtureProvider(pool,config):createProvider(config)));
  }
  async function locks(c,candidate) {
    const a=(await c.query('SELECT * FROM account WHERE id=$1 FOR UPDATE',[candidate.account_id])).rows[0];
    const p=(await c.query('SELECT * FROM payment_intent WHERE id=$1 FOR UPDATE',[candidate.id])).rows[0];
    if(!a||!p)throw new HttpError(404,'not_found');return {a,p};
  }
  return {
    async create(accountId,body,{cookieHeader,clearCookie}={}) {
      const input=paymentInput(body);requireUuid(accountId);adapter();
      const id=randomUUID(),key=randomUUID();
      const providerBody=JSON.stringify({amount:{value:'900.00',currency:'RUB'},capture:true,
        confirmation:{type:'redirect',return_url:config.origin+'/'},description:'RoomKind ROOM20',
        metadata:{intent_id:id,account_id:accountId,package:'ROOM20'}});
      let clear=false;const result=await transaction(pool,async c=>{
        if(!(await c.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[accountId])).rowCount)throw new HttpError(404,'not_found');
        const old=(await c.query('SELECT * FROM payment_intent WHERE account_id=$1 AND idempotency_key=$2',[accountId,input.key])).rows[0];
        if(old){if(old.request_hash!==input.hash)throw new HttpError(409,'idempotency_conflict');return view(old);}
        const selected=await attribution.resolve(c,accountId,input.code,cookieHeader);
        const partnerId=selected.partnerId;clear=selected.clearCookie;
        const p=(await c.query(`INSERT INTO payment_intent(id,account_id,idempotency_key,request_hash,package,amount_minor,currency,
          provider_mode,merchant_id,provider_key,provider_body,partner_id) VALUES($1,$2,$3,$4,'ROOM20',90000,'RUB',$5,$6,$7,$8,$9) RETURNING *`,
        [id,accountId,input.key,input.hash,config.providerMode,config.providerMode==='fixture'?'fixture':config.shopId,key,providerBody,partnerId])).rows[0];
        return view(p);
      });
      if(clear)clearCookie?.(trackingCookie('',config.secureCookie,true));
      return result;
    },
    async get(accountId,id) {
      requireUuid(id);const p=(await pool.query('SELECT * FROM payment_intent WHERE id=$1 AND account_id=$2',[id,accountId])).rows[0];
      if(!p)throw new HttpError(404,'not_found');return view(p);
    },
    async account(accountId) {
      return (await pool.query(`SELECT billing_hold,(badge_free_entitlement AND NOT billing_hold) AS badge_free_entitlement,
        (badge_free_entitlement AND NOT billing_hold) AS effective_badge_free_entitlement,
        (SELECT COALESCE(sum(delta),0)::int FROM credit_ledger WHERE account_id=a.id) AS credits FROM account a WHERE id=$1`,[accountId])).rows[0];
    },
    async runOne() {
      const remote=adapter();
      const candidates=(await pool.query(`SELECT * FROM payment_intent WHERE status='created' AND provider_mode=$1 AND merchant_id=$2
        AND next_attempt_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<=clock_timestamp()) ORDER BY created_at,id LIMIT 20`,
      [config.providerMode,config.providerMode==='fixture'?'fixture':config.shopId])).rows;
      for(const candidate of candidates) {
        const token=randomUUID();
        const p=await transaction(pool,async c=>{
          const {p}=await locks(c,candidate);const now=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now;
          if(p.status!=='created'||p.next_attempt_at>now||(p.lease_until&&p.lease_until>now))return null;
          if(p.first_attempt_at && now-p.first_attempt_at>=CREATE_WINDOW_MS){await c.query("UPDATE payment_intent SET status='review',lease_until=NULL WHERE id=$1",[p.id]);return null;}
          return (await c.query(`UPDATE payment_intent SET first_attempt_at=COALESCE(first_attempt_at,$2),lease_token=$3,
            lease_until=$2+interval '30 seconds',attempts=attempts+1,next_attempt_at=$2+interval '60 seconds' WHERE id=$1 RETURNING *`,[p.id,now,token])).rows[0];
        });
        if(!p)continue;
        let response,url,error;
        try {response=await remote.create(p.provider_body,p.provider_key);verifyPayment(response,p,response?.id);
          if(['pending','waiting_for_capture'].includes(response.status))url=confirmationUrl(response.confirmation?.confirmation_url,config.providerMode==='fixture',config.origin);
        }catch(e){error=e;}
        await transaction(pool,async c=>{
          const {p:current}=await locks(c,p);
          if(current.lease_token!==token)return;
          if(error){await c.query(`UPDATE payment_intent SET lease_until=NULL,status=CASE WHEN $2 THEN 'review' ELSE status END WHERE id=$1`,[p.id,error.status===422]);return;}
          verifyPayment(response,current,response.id);
          await c.query(`UPDATE payment_intent SET provider_id=$2,confirmation_url=COALESCE($3,confirmation_url),
            status=CASE WHEN status='created' THEN 'pending' ELSE status END,lease_until=NULL WHERE id=$1`,[p.id,response.id,url??null]);
        });
        // Creation never grants. Even an immediate success goes through authenticated GET below.
        if(!error&&['succeeded','canceled'].includes(response.status))await this.notify({event:'payment.'+response.status,object:{id:response.id}});
        return true;
      }
      return false;
    },
    async notify(body) {
      const signal=notification(body),remote=adapter();let refund,payment,id=signal.id,refundAmount;
      if(signal.kind==='refund'){refund=await remote.refund(id);verify(PROVIDER_ID.test(refund?.payment_id));id=refund.payment_id;refundAmount=verifyRefund(refund,signal.id,id);}
      payment=await remote.payment(id);
      const candidate=(await pool.query('SELECT * FROM payment_intent WHERE provider_id=$1',[id])).rows[0];
      // A notification racing checkout attachment retries without claiming an event.
      // Never turn notification metadata into a new provider-ID binding.
      if(!candidate)throw new HttpError(503,'payment_binding_pending');
      verify(candidate && candidate.provider_mode===config.providerMode && candidate.merchant_id===(config.providerMode==='fixture'?'fixture':config.shopId));
      verifyPayment(payment,candidate,id,signal.kind==='refund'?'succeeded':signal.event.slice(8));
      // Hash authenticated objects before taking locks; notification extras are never used.
      const stateHash=hash(JSON.stringify([payment,refund??null]));
      return transaction(pool,async c=>{
        const {a,p}=await locks(c,candidate);verifyPayment(payment,p,id,signal.kind==='refund'?'succeeded':signal.event.slice(8));
        if(refund)verifyRefund(refund,signal.id,id);
        const event=await c.query(`INSERT INTO provider_event(object_kind,provider_object_id,event_type,verified_state_sha)
          VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_type`,[signal.kind,signal.id,signal.event,stateHash]);
        if(!event.rowCount)return {ok:true};
        await c.query('UPDATE payment_intent SET provider_id=$2 WHERE id=$1',[p.id,id]);
        if(refund) {
          await c.query(`INSERT INTO verified_refund(provider_refund_id,payment_intent_id,provider_payment_id,amount_minor,currency)
            VALUES($1,$2,$3,$4,'RUB') ON CONFLICT DO NOTHING`,[signal.id,p.id,id,refundAmount]);
          await c.query('UPDATE account SET billing_hold=true WHERE id=$1',[a.id]);
          await c.query("UPDATE payment_intent SET status='review',confirmation_url=NULL WHERE id=$1",[p.id]);
          await c.query('UPDATE first_conversion SET valid=false WHERE payment_intent_id=$1',[p.id]);
          await jobs.holdQueued(c,a.id);
        } else if(payment.status==='succeeded') {
          // A review intent cannot gain credits; the first verified success still claims the permanent marker.
          const first=!a.first_paid_payment_id;
          if(first)await c.query('UPDATE account SET first_paid_payment_id=$2 WHERE id=$1',[a.id,p.id]);
          if(p.status!=='review') {
            await c.query(`INSERT INTO credit_ledger(id,account_id,delta,kind,reference) VALUES($1,$2,20,'purchase',$3)
              ON CONFLICT(kind,reference) DO NOTHING`,[randomUUID(),a.id,p.id]);
            await c.query("UPDATE payment_intent SET status='succeeded',confirmation_url=NULL WHERE id=$1",[p.id]);
            if(!a.billing_hold)await c.query('UPDATE account SET badge_free_entitlement=true WHERE id=$1',[a.id]);
            if(first&&!a.billing_hold&&p.partner_id) {
              const eligible=(await c.query('SELECT id FROM partner WHERE id=$1 AND active AND account_id IS NOT NULL AND account_id<>$2',[p.partner_id,a.id])).rowCount;
              if(eligible){await c.query(`INSERT INTO first_conversion(account_id,payment_intent_id,partner_id,amount_minor,currency)
                VALUES($1,$2,$3,90000,'RUB')`,[a.id,p.id,p.partner_id]);
                await c.query(`INSERT INTO event(id,account_id,type,reference,dedupe_key) VALUES($1,$2,'paid_conversion',$3,$4)
                  ON CONFLICT(dedupe_key) DO NOTHING`,[randomUUID(),a.id,p.id,'paid_conversion:'+a.id]);}
            }
          }
        } else if(!['succeeded','review'].includes(p.status))await c.query("UPDATE payment_intent SET status='canceled',confirmation_url=NULL WHERE id=$1",[p.id]);
        return {ok:true};
      });
    }
  };
}
