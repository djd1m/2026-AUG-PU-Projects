import {describe,it,expect,vi} from 'vitest';
import {z} from 'zod';
import {supportBody} from '../apps/web/src/server/support/boundary';
import {loadSupportConfig,loadMailConfig} from '../packages/shared/src/support-config';
import {SupportMailer} from '../apps/web/src/server/support/mail';
const deps={publicOrigin:'https://test.invalid',trustedProxyHops:1,allowIP:async()=>true};
function request(body:string,origin='https://test.invalid'){return new Request('https://test.invalid/api/auth/forgot',{method:'POST',headers:{origin,'content-type':'application/json','x-forwarded-for':'192.0.2.1, 127.0.0.1'},body});}
describe('support boundary',()=>{
 it('requires exact Origin and strict JSON, rejects literal 4097 bytes',async()=>{
  await expect(supportBody(request('{}','https://evil.test'),z.object({}).strict(),deps)).rejects.toMatchObject({status:403});
  await expect(supportBody(request('{"extra":true}'),z.object({}).strict(),deps)).rejects.toMatchObject({status:422});
  await expect(supportBody(request(' '.repeat(4097)),z.object({}).strict(),deps)).rejects.toMatchObject({status:413});
 });
 it('IP denial occurs before body consumption',async()=>{
  const r=request('{}');await expect(supportBody(r,z.object({}),{...deps,allowIP:async()=>false})).rejects.toMatchObject({status:429});expect(r.bodyUsed).toBe(false);
 });
 it('modes default disabled and test cannot run in production',()=>{
  expect(loadMailConfig({}).mode).toBe('disabled');expect(loadSupportConfig({}).mode).toBe('disabled');
  expect(()=>loadMailConfig({NODE_ENV:'production',N5_MAIL_MODE:'test'})).toThrow();
  expect(()=>loadSupportConfig({NODE_ENV:'production',N5_SUPPORT_MODE:'test'})).toThrow();
  expect(()=>loadMailConfig({N5_MAIL_MODE:'typo'})).toThrow();
 });
 it('isolated capture is injected privately and disabled performs no send',async()=>{
  const capture=vi.fn(async()=>{}),factory=vi.fn();const message={to:'x@example.test',url:'https://test.invalid/reset#token=private',purpose:'reset' as const};
  expect(await new SupportMailer({mode:'disabled'},capture,factory).send(message)).toBe('failed');expect(capture).not.toHaveBeenCalled();expect(factory).not.toHaveBeenCalled();
  expect(await new SupportMailer({mode:'test'},capture,factory).send(message)).toBe('accepted');expect(capture).toHaveBeenCalledOnce();
  expect(await new SupportMailer({mode:'test'},capture,factory).send({...message,to:'real@customer.ru'})).toBe('failed');expect(capture).toHaveBeenCalledOnce();
 });
});
