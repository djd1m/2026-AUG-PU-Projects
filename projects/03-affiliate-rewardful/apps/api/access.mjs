import { assert, object } from '../../shared/domain/common.mjs';
import { sessionCookie, accountToken } from './account.mjs';

const oauthCookie=(value,secure)=>`n3_oauth=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${value?600:0}${secure?'; Secure':''}`;
function cookie(req,name) {
  const values=(req.headers.cookie??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(`${name}=`));
  return values.length===1?values[0].slice(name.length+1):undefined;
}
const routes=new Set(['register','forgot','activate','reset','contact-email','verify-contact','yandex/start','yandex/unlink']);
export function accessHandler(app,{body,json,secure=true}) {
  return async(req,res,path)=>{
    const name=path.slice('/api/account/'.length);
    if(!path.startsWith('/api/account/'))return false;
    if(name==='access-status' && req.method==='GET') {
      assert(app.access,'UNAVAILABLE',503);json(res,200,{data:await app.access.status()});return true;
    }
    if(name==='yandex/callback' && req.method==='GET') {
      assert(app.access,'UNAVAILABLE',503);
      const query=new URL(req.url,'http://local').searchParams;
      assert([...query.keys()].every(x=>['code','state','error','error_description'].includes(x)) && [...query.keys()].every(x=>query.getAll(x).length===1),'OAUTH_STATE',400);
      try {
        const result=await app.access.oauth.callback({state:query.get('state'),code:query.get('code'),error:query.get('error'),
          browser:cookie(req,'n3_oauth'),session:cookie(req,'n3_session'),host:req.headers.host});
        const cookies=[oauthCookie('',secure)];
        if(result.token)cookies.push(sessionCookie(result.token,secure));
        res.writeHead(303,{'Set-Cookie':cookies,Location:`${result.origin}/account${result.error?'#access-error=cancelled':result.linked?'#access-result=linked':''}`});res.end();
      } catch(error) {
        // Fixed local destination and fixed error code: never reflect provider text,
        // authorization code, token, Host or query-supplied redirect destinations.
        const status=error.code==='ACCOUNT_COLLISION'?'collision':error.code==='IDENTITY_BOUND'?'bound':error.status===503?'unavailable':'invalid';
        res.writeHead(303,{'Set-Cookie':oauthCookie('',secure),Location:`/account#access-error=${status}`});res.end();
      }
      return true;
    }
    if(!routes.has(name))return false;
    assert(app.access,'UNAVAILABLE',503);assert(req.method==='POST','METHOD',405,'Требуется POST');
    assert(req.headers.origin,'ORIGIN_REQUIRED',403,'Нужен подтверждённый источник запроса');
    const input=await body(req),origin=req.headers.origin,peer=req.socket.remoteAddress;
    let result;
    if(['register','forgot'].includes(name))result=await app.access[name](input,origin,peer);
    else if(['activate','reset'].includes(name))result=await app.access[name](input);
    else if(name==='contact-email') {object(input,[]);result=await app.access.contact(accountToken(req),origin,peer);}
    else if(name==='verify-contact')result=await app.access.verifyContact(accountToken(req),input);
    else if(name==='yandex/start') {
      const started=await app.access.oauth.start(cookie(req,'n3_session'),input,origin,peer);
      res.setHeader('Set-Cookie',oauthCookie(started.browser,secure));result={url:started.url};
    } else {
      result=await app.access.oauth.unlink(accountToken(req),input);res.setHeader('Set-Cookie',sessionCookie('',secure));
    }
    json(res,200,{data:result});return true;
  };
}
