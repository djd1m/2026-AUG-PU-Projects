import { assert, object, safeTree } from '../../shared/domain/common.mjs';

export const COOKIE = 'n3_session';
export function sessionCookie(token, secure = true) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? 604800 : 0}${secure ? '; Secure' : ''}`;
}
function token(req) {
  const values=(req.headers.cookie ?? '').split(';').map(v=>v.trim()).filter(v=>v.startsWith(`${COOKIE}=`));
  assert(values.length===1,'UNAUTHENTICATED',401,'Войдите в аккаунт'); return values[0].slice(COOKIE.length+1);
}
export function accountHandler(app,{body,json,secure=true}) {
  return async (req,res,path)=>{
    if (!path.startsWith('/api/account/')) return false;
    assert(app.identity,'UNAVAILABLE',503);
    if (path==='/api/account/me' && req.method==='GET') { json(res,200,{data:await app.identity.me(token(req))}); return true; }
    assert(req.method==='POST','METHOD',405,'Требуется POST');
    // Exact allowlist is checked by outer HTTP boundary; no-Origin cookie writes are denied too.
    assert(req.headers.origin,'ORIGIN_REQUIRED',403,'Нужен подтверждённый источник запроса');
    const input=await body(req); safeTree(input);
    let result;
    if (path.endsWith('/register') || path.endsWith('/login')) {
      const method=path==='/api/account/register'?'register':path==='/api/account/login'?'login':null;
      assert(method,'NOT_FOUND',404); result=await app.identity[method](input);
      res.setHeader('Set-Cookie',sessionCookie(result.token,secure)); result={expiresAt:result.expiresAt};
    } else if (path==='/api/account/logout') {
      object(input,[]); result=await app.identity.logout(token(req)); res.setHeader('Set-Cookie',sessionCookie('',secure));
    } else if (path==='/api/account/password') {
      result=await app.identity.changePassword(token(req),input); res.setHeader('Set-Cookie',sessionCookie('',secure));
    } else if (path==='/api/account/accept-invite') result=await app.identity.acceptInvite(token(req),input);
    else if (path==='/api/account/invite' || path==='/api/account/agent-token') {
      object(input,['membershipId','input'],['membershipId','input']);
      result=await app.identity[path.endsWith('/invite')?'invite':'mintAgent'](token(req),input.membershipId,input.input);
    } else if (path==='/api/account/command') {
      object(input,['membershipId','action','input','idempotencyKey'],['membershipId','action']);
      result=await app.executeReal(token(req),input.membershipId,input.action,input.input ?? {},input.idempotencyKey);
    } else if (path==='/api/account/checkout') {
      object(input,['membershipId','input','idempotencyKey'],['membershipId','input','idempotencyKey']);
      result=await app.payments.checkout(token(req),input.membershipId,input.input,input.idempotencyKey);
    } else if (path==='/api/account/payment-status') {
      object(input,['membershipId'],['membershipId']); result=await app.payments.status(token(req),input.membershipId);
    } else assert(false,'NOT_FOUND',404,'Маршрут не найден');
    json(res,200,{data:result}); return true;
  };
}
