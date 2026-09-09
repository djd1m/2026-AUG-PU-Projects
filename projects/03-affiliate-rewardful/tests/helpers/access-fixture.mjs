import { randomUUID,createHash } from 'node:crypto';
import { fixture } from './core-fixture.mjs';

export const accessOrigin='https://n3-a.212.192.0.33.sslip.io';
export const accessPassword='A unique access password 75!';
export async function accessFixture(t,extra={}) {
  let clock=Date.parse('2026-09-09T12:00:00Z');
  const messages=[],profiles=new Map(),tokens=new Map(),calls=[];
  const faults={mail:false,profile:null};
  const config={mail:{enabled:true,apiKey:'re_isolated_only_key',from:'Круг <access@example.test>'},
    yandex:{enabled:true,clientId:'isolated-client',clientSecret:'isolated-client-secret'},verificationRequired:false};
  const fetchImpl=async(url,options)=>{
    url=String(url);calls.push(url);
    if(url==='https://api.resend.com/emails') {
      if(faults.mail)throw new Error('isolated mail outage');
      const message=JSON.parse(options.body);messages.push(message);return Response.json({id:randomUUID()});
    }
    if(url==='https://oauth.yandex.ru/token') {
      const input=new URLSearchParams(options.body),profile=profiles.get(input.get('code'));
      if(!profile || (profile.testChallenge && createHash('sha256').update(input.get('code_verifier')??'').digest('base64url')!==profile.testChallenge))return Response.json({error:'invalid_grant'},{status:400});
      profiles.delete(input.get('code'));const token=randomUUID();tokens.set(token,profile);return Response.json({access_token:token,token_type:'bearer'});
    }
    if(url==='https://login.yandex.ru/info?format=json') {
      if(faults.profile)await faults.profile();
      const headers=new Headers(options.headers),profile=tokens.get(headers.get('authorization')?.slice(6));
      return Response.json(profile??{});
    }
    throw new Error('Unexpected isolated provider endpoint');
  };
  const f=await fixture(t,{clock:()=>clock,accessConfig:config,accessFetch:fetchImpl,...extra});
  const tokenFor=(email,purpose)=>{
    const message=messages.findLast(m=>m.to.includes(email) && m.text.includes(`access=${purpose}`));
    if(!message)return null;
    return new URLSearchParams(new URL(message.text.match(/https:\/\/\S+/)[0]).hash.slice(1)).get('token');
  };
  const register=async(email=`${randomUUID()}@example.test`)=>{
    await f.app.access.register({email,name:'Access Org'},accessOrigin,randomUUID());
    await f.app.access.activate({token:tokenFor(email,'register'),password:accessPassword});
    const user=await f.app.identity.login({email,password:accessPassword});
    return {...user,email,membershipId:(await f.app.identity.me(user.token)).memberships[0].membershipId};
  };
  const flow=async({plain,intent='login',origin=accessOrigin,...rest}={})=>{
    const started=await f.app.access.oauth.start(plain,{intent,...rest},origin,randomUUID());
    return {state:new URL(started.url).searchParams.get('state'),browser:started.browser,host:new URL(origin).host};
  };
  const codeFor=(externalId=randomUUID(),email=`${randomUUID()}@example.test`,testChallenge)=>{const code=randomUUID();profiles.set(code,{id:externalId,default_email:email,...(testChallenge?{testChallenge}:{})});return code;};
  return {f,config,messages,profiles,calls,faults,tokenFor,register,flow,codeFor,now:()=>clock,advance:ms=>{clock+=ms;}};
}
