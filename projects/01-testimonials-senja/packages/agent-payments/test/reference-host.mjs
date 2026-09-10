import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createPaymentsEngine, PostgresStore, migrate } from '../dist/index.js';
export const pool=new pg.Pool({connectionString:process.env.AGENT_PAYMENTS_TEST_DATABASE_URL??process.env.TEST_DATABASE_URL,max:12});
export async function setup() {
  await migrate(pool);
  await pool.query('CREATE TABLE IF NOT EXISTS agent_payments.reference_receipts (merchant text, event_id text, kind text, minor text, txid text, PRIMARY KEY(merchant,event_id))');
}
export class FakeProvider {
  provider='fake';accountId=`test-shop-${randomUUID()}`;test=true;supportsSavedMethods=true;
  creates=0;queries=0;payments=new Map();refunds=new Map();loseResponse=false;pending=false;gate;
  async create(request) {
    this.creates++;if(this.gate)await this.gate;
    const result={providerId:randomUUID(),accountId:this.accountId,test:true,orderId:request.orderId,attemptId:request.attemptId,amount:request.amount,status:this.pending?'pending':'succeeded',...(this.pending?{confirmationUrl:'https://yoomoney.ru/test'}:{}),...(request.saveMethod?{savedMethod:{reference:'private-method',saved:true}}:{})};
    this.payments.set(result.providerId,result);
    if(this.loseResponse)throw Error('response lost');return result;
  }
  async query(request,providerId) {this.queries++;return this.payments.get(providerId)??null;}
  async queryRefund(refundId){return this.refunds.get(refundId);}
}
export async function fixture({amount='1000',product='course',attribution=false}={}) {
  let now=new Date('2026-09-10T10:00:00Z');
  const scope={merchantId:randomUUID(),buyerId:'buyer',resourceId:'resource'};
  const human={...scope,humanId:'owner',consentReference:'csrf-verified-consent'};
  const offer={productId:product,amount:{minor:amount,currency:'RUB'},termsVersion:'v1',billingPeriod:'period-1',budgetPeriod:'2026-09',expiresAt:'2026-09-10T11:00:00Z',autonomousEligible:true,attributionRequired:attribution,description:'Independent reference product'};
  const provider=new FakeProvider();const store=new PostgresStore(pool);
  let rollback=false;
  const host={
    getOffer:async()=>({...offer,amount:{...offer.amount}}),
    approvalUrl:id=>`https://reference.example/approve/${id}`,
    returnUrl:id=>`https://reference.example/return/${id}`,
    lockResource:async(c,s)=>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['reference-host',s.merchantId,s.resourceId])]);},
    fulfill:async(c,event)=> {
      await c.query("INSERT INTO agent_payments.reference_receipts VALUES($1,$2,'paid',$3,txid_current()::text) ON CONFLICT DO NOTHING",[scope.merchantId,event.eventId,event.amount.minor]);
      if(rollback)throw Error('fulfillment failure');return 'active';
    },
    refund:async(c,event)=> {
      await c.query("INSERT INTO agent_payments.reference_receipts VALUES($1,$2,'refund',$3,txid_current()::text) ON CONFLICT DO NOTHING",[scope.merchantId,event.eventId,event.refundedMinor]);return 'review_required';
    },
  };
  const options={store,provider,host,clock:()=>now};
  const engine=createPaymentsEngine(options);
  const grant=await engine.issueGrant(human,{audience:'reference-agent',expiresAt:'2026-12-01T00:00:00Z'});
  const agent={merchantId:scope.merchantId,token:grant.token,audience:'reference-agent'};
  async function order(key=randomUUID()) {const quote=await engine.getOffer(agent,product);return engine.createOrder(agent,{quoteId:quote.quoteId,idempotencyKey:key});}
  async function mandate(extra={}) {return engine.createMandate(human,{productId:product,amount:{...offer.amount},termsVersion:'v1',validUntil:'2026-12-01T00:00:00Z',perPaymentMinor:amount,perBudgetPeriodMinor:amount,sharedBudgetMinor:amount,calendar:'UTC',...extra});}
  async function seedMethod() {await pool.query('INSERT INTO agent_payments.methods VALUES($1,$2,$3,$4,$5,$6)',[scope.merchantId,scope.buyerId,scope.resourceId,provider.provider,provider.accountId,{reference:'private-method',test:true,consentOrderId:'fixture'}]);}
  return {scope,human,offer,provider,store,host,options,engine,grant,agent,order,mandate,seedMethod,setNow:value=>{now=new Date(value);},setRollback:value=>{rollback=value;}};
}
