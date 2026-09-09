import { advanceRealClock } from '../identity/state.mjs';
import { assert, object, safeTree, str, integer, id, hash, AppError } from '../domain/common.mjs';
import { transaction } from '../infrastructure/postgres.mjs';
import { persistChanges } from '../infrastructure/journal.mjs';
import { fixtureEvent } from '../domain/events.mjs';
import { createYooKassa, YooKassaInputError, YooKassaVerificationError } from './yookassa.mjs';

export function createPayments({pool,identity,now,config,fetchImpl,referrals}) {
  const enabled=config?.enabled===true;
  if (enabled) {
    assert(typeof config.tenantId==='string' && /^[a-f0-9-]{36}$/.test(config.tenantId),'PAYMENT_CONFIG',503);
    assert(new URL(config.returnUrl).protocol==='https:','PAYMENT_CONFIG',503);
  }
  const provider=enabled?createYooKassa({shopId:config.shopId,secretKey:config.secretKey,testMode:config.testMode,fetchImpl}):null;
  let active=0;
  async function remote(operation) {
    assert(provider,'PAYMENT_UNCONFIGURED',503,'ЮKassa для этой организации не подключена');
    assert(active<4,'PROVIDER_BUSY',503); active++;
    try { return await operation(); }
    catch(error) {
      if (error instanceof YooKassaVerificationError) throw new AppError('PROVIDER_UNVERIFIED',409,'Событие не подтверждено провайдером');
      if (error instanceof YooKassaInputError) throw new AppError('PROVIDER_INPUT',400,'Некорректный запрос провайдеру');
      if (error instanceof AppError) throw error;
      throw new AppError('PROVIDER_UNAVAILABLE',503,'Нет подтверждения ЮKassa; повторите прежний запрос');
    } finally { active--; }
  }
  async function status(token,membershipId) {
    return transaction(pool,async client=>{
      const resolved=await identity.resolveUser(client,token,membershipId), {actor}=await identity.lockedState(client,resolved);
      assert(actor.role==='merchant','FORBIDDEN',403);
      const configured=enabled && resolved.tenant_id===config.tenantId;
      const orders=(await client.query('SELECT id,provider_id,status,input,created_at,confirmation_url FROM checkout_orders WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100',[resolved.tenant_id])).rows;
      identity.fresh(resolved.expires_at); return {configured,tenantId:resolved.tenant_id,testMode:configured?config.testMode:null,shopId:configured?config.shopId:null,
        orders:orders.map(o=>({orderId:o.id,paymentId:o.provider_id,status:o.status,...o.input,createdAt:o.created_at,confirmationUrl:o.confirmation_url}))};
    });
  }
  async function checkout(token,membershipId,input,key) {
    safeTree(input); object(input,['beneficiaryId','customerId','amountMinor','kind'],['beneficiaryId','customerId','amountMinor','kind']);
    str(key,160); str(input.beneficiaryId); str(input.customerId); integer(input.amountMinor,1); assert(['cash','credit'].includes(input.kind));
    const order=await transaction(pool,async client=>{
      const resolved=await identity.resolveUser(client,token,membershipId), {state,actor}=await identity.lockedState(client,resolved);
      assert(actor.role==='merchant','FORBIDDEN',403);
      assert(enabled && resolved.tenant_id===config.tenantId,'PAYMENT_UNCONFIGURED',503,'ЮKassa для этой организации не подключена');
      const previous=(await client.query('SELECT * FROM checkout_orders WHERE tenant_id=$1 AND command_key=$2',[resolved.tenant_id,key])).rows[0];
      if (previous) { assert(previous.shop_id===config.shopId && previous.test_mode===config.testMode,'SHOP_CHANGED',409,'Магазин изменился; нужна сверка исходной заявки'); assert(previous.input_hash===hash(input),'IDEMPOTENCY_CONFLICT',409); identity.fresh(resolved.expires_at); return previous; }
      const beneficiary=state.actors.find(a=>a.id===input.beneficiaryId);
      assert(beneficiary?.role===(input.kind==='cash'?'partner':'customer'),'INVALID_BENEFICIARY',400);
      assert(input.customerId!==beneficiary.id,'SELF_REFERRAL',400);
      assert(state.policyConfigured.includes(input.kind),'POLICY_REQUIRED',409,'Сначала опубликуйте условия программы');
      const policy=state.policies.findLast(p=>p.kind===input.kind);
      const count=(await client.query('SELECT count(*)::int AS n FROM checkout_orders WHERE tenant_id=$1',[resolved.tenant_id])).rows[0].n;
      assert(count<5000,'ORDER_LIMIT',429);
      const row=(await client.query(`INSERT INTO checkout_orders(id,tenant_id,shop_id,test_mode,command_key,input_hash,input,policy_id,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[id(),state.runId,config.shopId,config.testMode,key,hash(input),JSON.stringify(input),policy.id,new Date(now())])).rows[0];
      identity.fresh(resolved.expires_at); return row;
    });
    return completeOrder(order, client=>identity.resolveUser(client,token,membershipId));
  }
  async function completeOrder(order, resolveAuthority) {
    if (order.provider_id) return {orderId:order.id,paymentId:order.provider_id,status:order.status,confirmationUrl:order.confirmation_url};
    // YooKassa stores idempotence keys for24h. After23h an ambiguous create requires reconciliation.
    assert(now()-new Date(order.created_at).getTime()<23*3600000,'RECONCILIATION_REQUIRED',409,'Срок безопасного повтора истёк; сверьте платёж в ЮKassa');
    const payment=await remote(()=>provider.createPayment({orderId:order.id,amountMinor:order.input.amountMinor,
      returnUrl:order.source==='connector'?order.return_url:config.returnUrl,description:'Круг: оплата заказа'}));
    return transaction(pool,async client=>{
      const resolved=await resolveAuthority(client);
      const current=(await client.query('SELECT * FROM checkout_orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[order.id,resolved.tenant_id])).rows[0];
      assert(current,'NOT_FOUND',404);
      assert(!current.provider_id || current.provider_id===payment.id,'PAYMENT_BINDING_CONFLICT',409);
      assert(payment.orderId===order.id && payment.amountMinor===order.input.amountMinor && payment.recipientAccountId===current.shop_id && payment.test===current.test_mode,'PAYMENT_BINDING_CONFLICT',409);
      await client.query("UPDATE checkout_orders SET provider_id=$2,confirmation_url=$3,status=CASE WHEN status='succeeded' THEN status ELSE $4 END WHERE id=$1",
        [order.id,payment.id,payment.confirmationUrl,payment.status==='succeeded'?'awaiting_notification':payment.status]);
      identity.fresh(resolved.expires_at); return {orderId:order.id,paymentId:payment.id,status:current.status==='succeeded'?'succeeded':payment.status==='succeeded'?'awaiting_notification':payment.status,confirmationUrl:payment.confirmationUrl};
    });
  }
  async function connectorCheckout(token,input,key) {
    assert(referrals,'INTEGRATION_UNAVAILABLE',503);
    safeTree(input); object(input,['customerId','amountMinor'],['customerId','amountMinor']);
    str(input.customerId,160); integer(input.amountMinor,1); str(key,160);
    const order=await transaction(pool,async client=>{
      const resolved=await referrals.authorize(client,token);
      const {state}=await identity.lockedState(client,resolved);
      assert(enabled && state.runId===config.tenantId,'PAYMENT_UNCONFIGURED',503,'ЮKassa для этой организации не подключена');
      const commandKey=`connector:${hash(key)}`;
      const previous=(await client.query('SELECT * FROM checkout_orders WHERE tenant_id=$1 AND command_key=$2',[state.runId,commandKey])).rows[0];
      if(previous) {
        assert(previous.source==='connector' && previous.shop_id===config.shopId && previous.test_mode===config.testMode,'SHOP_CHANGED',409);
        assert(previous.input_hash===hash(input),'IDEMPOTENCY_CONFLICT',409);referrals.fresh(resolved);return previous;
      }
      const customer=await referrals.customer(client,state.runId,input.customerId);
      const program=(await client.query('SELECT return_url FROM referral_programs WHERE tenant_id=$1',[state.runId])).rows[0];
      assert(program,'INTEGRATION_UNCONFIGURED',409);
      assert(state.policyConfigured.includes('cash'),'POLICY_REQUIRED',409,'Сначала опубликуйте условия программы');
      const policy=state.policies.findLast(p=>p.kind==='cash');
      const count=(await client.query('SELECT count(*)::int AS n FROM checkout_orders WHERE tenant_id=$1',[state.runId])).rows[0].n;
      assert(count<5000,'ORDER_LIMIT',429);
      const attribution={id:customer.id,beneficiaryId:customer.beneficiary_id,channel:customer.channel,
        attributedAt:customer.attributed_at?new Date(customer.attributed_at).toISOString():null,
        registeredAt:new Date(customer.registered_at).toISOString(),testMode:config.testMode};
      const paymentInput={customerId:input.customerId,amountMinor:input.amountMinor,beneficiaryId:customer.beneficiary_id,kind:'cash'};
      const row=(await client.query(`INSERT INTO checkout_orders(id,tenant_id,shop_id,test_mode,command_key,input_hash,input,policy_id,created_at,source,attribution,return_url)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'connector',$10,$11) RETURNING *`,
        [id(),state.runId,config.shopId,config.testMode,commandKey,hash(input),JSON.stringify(paymentInput),policy.id,new Date(now()),JSON.stringify(attribution),program.return_url])).rows[0];
      referrals.fresh(resolved);return row;
    });
    return completeOrder(order,client=>referrals.authorize(client,token));
  }
  async function connectorOrder(token,orderId) {
    assert(referrals,'INTEGRATION_UNAVAILABLE',503);str(orderId);assert(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(orderId));
    return transaction(pool,async client=>{
      const resolved=await referrals.authorize(client,token),{state}=await identity.lockedState(client,resolved);
      const order=(await client.query("SELECT * FROM checkout_orders WHERE id=$1 AND tenant_id=$2 AND source='connector'",[orderId,state.runId])).rows[0];
      assert(order,'NOT_FOUND',404);
      const paymentKey=`yookassa/${order.shop_id}/${order.provider_id}`;
      const refundedAmountMinor=state.refunds.filter(r=>r.paymentKey===paymentKey).reduce((sum,r)=>sum+r.amountMinor,0);
      referrals.fresh(resolved);
      return {orderId:order.id,paymentId:order.provider_id,status:order.status,customerId:order.input.customerId,
        amountMinor:order.input.amountMinor,refundedAmountMinor,netAmountMinor:order.input.amountMinor-refundedAmountMinor,
        verified:order.status==='succeeded',testMode:order.test_mode,confirmationUrl:order.confirmation_url};
    });
  }
  async function webhook(raw) {
    const verified=await remote(()=>provider.verifyNotification(raw));
    if (!verified) return {ignored:true};
    const {payment,refund}=verified;
    return transaction(pool,async client=>{
      // Order is authoritative for tenant and reward recipient; remote metadata is only a lookup hint.
      // One lock order for checkout, connector binding and webhook: tenant, then order.
      const found=(await client.query('SELECT id FROM checkout_orders WHERE id=$1 AND tenant_id=$2 AND shop_id=$3',
        [payment.orderId,config.tenantId,config.shopId])).rows[0];
      if (!found) return {ignored:true};
      const state=(await client.query("SELECT state FROM tenants WHERE id=$1 AND mode='real' FOR UPDATE",[config.tenantId])).rows[0]?.state;
      assert(state,'FORBIDDEN',403);
      const order=(await client.query('SELECT * FROM checkout_orders WHERE id=$1 AND tenant_id=$2 AND shop_id=$3 FOR UPDATE',
        [payment.orderId,config.tenantId,config.shopId])).rows[0];
      assert(order,'PAYMENT_BINDING_CONFLICT',409);
      assert((!order.provider_id || order.provider_id===payment.id) && order.input.amountMinor===payment.amountMinor,
        'PAYMENT_BINDING_CONFLICT',409,'Платёж не соответствует заявке');
      assert(payment.recipientAccountId===order.shop_id && payment.test===config.testMode && payment.test===order.test_mode,'PAYMENT_BINDING_CONFLICT',409);
      const before=structuredClone(state); advanceRealClock(state,now());
      const fact={type:'payment',provider:'yookassa',accountId:config.shopId,objectId:payment.id,verified:true,status:'confirmed',
        ...order.input,paidAt:new Date(payment.paidAt).toISOString(),
        ...(order.source==='connector'?{}:{cookie:{beneficiaryId:order.input.beneficiaryId,attributedAt:new Date(order.created_at).toISOString()}})};
      assert(order.source!=='connector' || (order.attribution && order.attribution.testMode===order.test_mode),'ATTRIBUTION_UNAVAILABLE',409);
      const result=fixtureEvent(state,fact,order.policy_id,order.source==='connector'?order.attribution:undefined);
      let correction=null;
      if (refund) correction=fixtureEvent(state,{type:'refund',provider:'yookassa',accountId:config.shopId,objectId:refund.id,paymentId:payment.id,
        verified:true,status:'confirmed',amountMinor:refund.amountMinor,refundedAt:new Date(refund.refundedAt).toISOString()});
      await persistChanges(client,state.runId,before,state);
      await client.query("UPDATE checkout_orders SET provider_id=$2,status='succeeded' WHERE id=$1",[order.id,payment.id]);
      return {accepted:true,payment:result,refund:correction};
    });
  }
  return {checkout,status,webhook,connectorCheckout,connectorOrder};
}
