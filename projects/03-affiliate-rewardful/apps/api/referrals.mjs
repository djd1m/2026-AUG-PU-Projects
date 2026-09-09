import { assert, object, safeTree } from '../../shared/domain/common.mjs';
import { captureReferral } from '../../shared/client/referral-tracker.mjs';

export function referralRoute(path) {
  if (/^\/r\/[^/]+$/.test(path) || /^\/api\/referrals\/[^/]+\/tracker\.js$/.test(path)) return 'public';
  if (path.startsWith('/api/integration/')) return 'private';
  return null;
}
export function referralHandler(app,{body,json}) {
  return async (req,res,path)=>{
    const kind=referralRoute(path);if(!kind)return false;
    assert(app.referrals,'UNAVAILABLE',503);
    if(kind==='public') {
      assert(req.method==='GET','METHOD',405);
      if(path.startsWith('/r/')) {
        const {location}=await app.referrals.visit(path.slice(3));
        res.writeHead(302,{Location:location});res.end();return true;
      }
      const config=await app.referrals.trackerConfig(path.split('/')[3]);
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});
      res.end(`(${captureReferral.toString()})(${JSON.stringify(config).replaceAll('<','\\u003c')});`);return true;
    }
    assert(!req.headers.origin,'ORIGIN_DENIED',403,'Интеграция доступна только серверу магазина');
    assert(req.method==='POST','METHOD',405);
    const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '')?.[1];
    assert(token,'UNAUTHENTICATED',401);
    const input=await body(req);safeTree(input);let data;
    if(path==='/api/integration/customers') data=await app.referrals.bind(token,input);
    else if(path==='/api/integration/checkout') {
      object(input,['customerId','amountMinor','idempotencyKey'],['customerId','amountMinor','idempotencyKey']);
      data=await app.payments.connectorCheckout(token,{customerId:input.customerId,amountMinor:input.amountMinor},input.idempotencyKey);
    } else if(path==='/api/integration/external-orders') {
      object(input,['customerId','amountMinor','idempotencyKey'],['customerId','amountMinor','idempotencyKey']);
      data=await app.payments.externalOrder(token,{customerId:input.customerId,amountMinor:input.amountMinor},input.idempotencyKey);
    } else if(path==='/api/integration/external-events') {
      data=await app.payments.externalEvent(token,input);
    } else if(path==='/api/integration/order') {
      object(input,['orderId'],['orderId']);data=await app.payments.connectorOrder(token,input.orderId);
    } else assert(false,'NOT_FOUND',404);
    json(res,200,{data});return true;
  };
}
