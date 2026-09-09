import { randomUUID } from 'node:crypto';
import { fixture } from './core-fixture.mjs';

export async function referralPaymentFixture(t) {
  let clock=Date.parse('2026-09-09T12:00:00Z');
  const payments=new Map(),refunds=new Map(),calls=[];
  const faults={drop:false,beforeReturn:null,beforeGet:null};
  const config={enabled:false,shopId:'123456',secretKey:'isolated-test-secret',testMode:true,returnUrl:'https://merchant.example/legacy'};
  const fetchImpl=async (url,options)=>{
    calls.push({url,method:options.method,key:options.headers['idempotence-key']});
    if(options.method==='POST') {
      const input=JSON.parse(options.body);
      let payment=[...payments.values()].find(row=>row.metadata.order_id===input.metadata.order_id);
      if(!payment) {
        payment={id:randomUUID(),status:'pending',paid:false,refundable:false,test:config.testMode,amount:input.amount,recipient:{account_id:config.shopId},
          metadata:input.metadata,confirmation:{type:'redirect',confirmation_url:'https://yoomoney.ru/checkout/isolated-test'},returnUrl:input.confirmation.return_url};
        payments.set(payment.id,payment);
      }
      if(faults.beforeReturn) await faults.beforeReturn(payment);
      if(faults.drop) {faults.drop=false;throw new TypeError('Isolated lost response');}
      return Response.json(payment);
    }
    if(faults.beforeGet) await faults.beforeGet();
    const target=url.includes('/refunds/')?refunds:payments, row=target.get(url.split('/').at(-1));
    return row?Response.json(row):Response.json({error:'not_found'},{status:404});
  };
  const f=await fixture(t,{clock:()=>clock,yookassaConfig:config,paymentFetch:fetchImpl});
  const register=()=>f.app.identity.register({email:`${randomUUID()}@example.test`,password:'Referral payments test password 52!',name:'Test'});
  const owner=await register(),partner=await register();
  const ownerEmail=(await f.app.identity.me(owner.token)).email;
  config.tenantId=(await f.app.identity.me(owner.token)).memberships[0].tenantId;config.enabled=true;await f.restart();
  const invite=await f.app.identity.invite(owner.token,owner.membershipId,{role:'partner'});
  const joined=await f.app.identity.acceptInvite(partner.token,{invitation:invite.invitation,name:'Test partner'});
  const command=(action,input={})=>f.app.executeReal(owner.token,owner.membershipId,action,input,randomUUID());
  const publish=(recurring=true)=>command('program.save',{kind:'cash',bps:2000,windowDays:30,holdDays:30,recurring});
  await publish();
  await f.app.executeReal(partner.token,joined.membershipId,'enrollment.join',{consent:true},randomUUID());
  await f.app.referrals.configure(owner.token,owner.membershipId,{landingUrl:'https://merchant.example/signup',returnUrl:'https://merchant.example/complete'});
  let key=(await f.app.referrals.rotate(owner.token,owner.membershipId)).token;
  const visit=async()=>new URL((await f.app.referrals.visit(joined.actorId)).location).searchParams.get('n3_ref');
  const bind=async (extra={})=>{
    const input={customerId:randomUUID(),email:`${randomUUID()}@example.test`,emailVerified:true,visitToken:await visit(),...extra};
    await f.app.referrals.bind(key,input);return input.customerId;
  };
  const checkout=(customerId,idempotencyKey=randomUUID(),amountMinor=100000)=>f.app.payments.connectorCheckout(key,{customerId,amountMinor},idempotencyKey);
  const notification=(event,object)=>JSON.stringify({type:'notification',event,object});
  const succeed=id=>{clock+=1000;const payment=payments.get(id);Object.assign(payment,{status:'succeeded',paid:true,captured_at:new Date(clock).toISOString()});return payment;};
  const settle=async order=>f.app.payments.webhook(notification('payment.succeeded',succeed(order.paymentId)));
  const refund=async (order,amountMinor)=>{
    clock+=1000;const object={id:randomUUID(),payment_id:order.paymentId,status:'succeeded',amount:{value:(amountMinor/100).toFixed(2),currency:'RUB'},created_at:new Date(clock).toISOString()};
    refunds.set(object.id,object);await f.app.payments.webhook(notification('refund.succeeded',object));return object;
  };
  return {f,owner,partner,joined,config,payments,refunds,calls,faults,command,publish,visit,bind,checkout,notification,succeed,settle,refund,
    get key(){return key;},advance:ms=>{clock+=ms;},now:()=>clock,
    async reauthenticate(){owner.token=(await f.app.identity.login({email:ownerEmail,password:'Referral payments test password 52!'})).token;},
    async rotate(){key=(await f.app.referrals.rotate(owner.token,owner.membershipId)).token;return key;}};
}
