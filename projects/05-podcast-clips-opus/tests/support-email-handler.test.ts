import {describe,it,expect,vi} from 'vitest';
import type {AuthService} from '../apps/web/src/server/auth';
import {createEmailHandler,type EmailDeps} from '../apps/web/src/server/support/email-handler';
import {SupportMailer} from '../apps/web/src/server/support/mail';
function deps(issue:()=>Promise<unknown>):EmailDeps {return {
 auth:{authenticate:async()=>null} as unknown as AuthService,
 store:{issue,delivery:async()=>{}} as unknown as EmailDeps['store'],
 mailer:new SupportMailer({mode:'test'},async()=>{}),mailAvailable:true,
 publicOrigin:'https://test.invalid',trustedProxyHops:1,secret:'synthetic-secret',allowIP:async()=>true,after:()=>{},
};}
function request(body:unknown){return new Request('https://test.invalid/api/auth/forgot',{method:'POST',headers:{origin:'https://test.invalid','content-type':'application/json','x-forwarded-for':'192.0.2.1, 127.0.0.1'},body:JSON.stringify(body)});}
describe('forgot non-enumeration',()=>{
 it('missing, cooldown/quota/storage refusal, persistence failure and delivery failure return same202',async()=>{
  const responses=[];
  for(const issue of [async()=>null,async()=>{throw new Error('database unavailable');},async()=>({id:'synthetic',token:'synthetic',email:'synthetic@example.test'})]) {
   const d=deps(issue);d.after=()=>{throw new Error('lifecycle unavailable');};
   const response=await createEmailHandler('forgot',d)(request({email:'synthetic@example.test'}));
   expect(response.status).toBe(202);responses.push(await response.json());
   expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  }
  expect(responses[0]).toEqual(responses[1]);expect(responses[1]).toEqual(responses[2]);
 });
 it('mail delivery runs only after the response lifecycle schedules it',async()=>{
  const d=deps(async()=>({id:'synthetic',token:'synthetic',email:'synthetic@example.test'})),send=vi.spyOn(d.mailer,'send');
  let after:(()=>Promise<void>)|undefined;d.after=task=>{after=task;};
  const response=await createEmailHandler('forgot',d)(request({email:'synthetic@example.test'}));
  expect(response.status).toBe(202);expect(send).not.toHaveBeenCalled();await after!();expect(send).toHaveBeenCalledOnce();
 });
 it('strict password bounds reject 73UTF8 bytes before token/bcrypt work',async()=>{
  const d=deps(async()=>null);const response=await createEmailHandler('reset',d)(request({token:'A'.repeat(43),password:'я'.repeat(37)}));expect(response.status).toBe(422);
 });
});
