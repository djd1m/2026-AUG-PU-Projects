import {afterEach,describe,it,expect,vi} from 'vitest';
import {SupportMailer} from '../apps/web/src/server/support/mail';
const config={mode:'resend' as const,apiKey:'synthetic-key',from:'КлипМейкер <sender@example.test>'};
const message={to:'recipient@example.test',url:'https://test.invalid/reset#token=synthetic&x="<',purpose:'reset' as const};
const mailer=(fetchImpl:typeof fetch,c=config)=>new SupportMailer(c,undefined,undefined,fetchImpl);
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
describe('bounded Resend transport',()=>{
 it('uses the fixed HTTP contract and snapshots operator configuration',async()=>{
  const fetchImpl=vi.fn<typeof fetch>().mockResolvedValue(Response.json({id:'synthetic-id'}));
  const c={...config};const send=mailer(fetchImpl,c);c.apiKey='changed';
  expect(await send.send(message)).toBe('accepted');
  const [url,options]=fetchImpl.mock.calls[0]!;
  expect(url).toBe('https://api.resend.com/emails');
  expect(options).toMatchObject({method:'POST',redirect:'error',headers:{authorization:'Bearer synthetic-key','content-type':'application/json'}});
  expect(options!.signal).toBeInstanceOf(AbortSignal);
  const body=JSON.parse(options!.body as string);
  expect(body).toMatchObject({from:config.from,to:[message.to],subject:'Восстановление пароля КлипМейкер'});
  expect(body.text).toContain(message.url);expect(body.html).toContain('&amp;x=&quot;&lt;');
 });
 it.each([400,401,429,500])('maps definite HTTP %s refusal to failed without retry',async status=>{
  const fetchImpl=vi.fn<typeof fetch>().mockResolvedValue(new Response('private recipient/token',{status}));
  expect(await mailer(fetchImpl).send(message)).toBe('failed');expect(fetchImpl).toHaveBeenCalledTimes(1);
 });
 it.each(['{}','{"id":""}','not JSON',JSON.stringify({id:'x'.repeat(17000)})])('keeps ambiguous responses unknown',async body=>{
  expect(await mailer(vi.fn<typeof fetch>().mockResolvedValue(new Response(body))).send(message)).toBe('unknown');
 });
 it('does not log provider exceptions, bodies, recipients or tokens',async()=>{
  const error=vi.spyOn(console,'error'),info=vi.spyOn(console,'info'),log=vi.spyOn(console,'log'),warn=vi.spyOn(console,'warn');
  expect(await mailer(vi.fn<typeof fetch>().mockRejectedValue(new Error(message.url+config.apiKey))).send(message)).toBe('unknown');
  for(const spy of [error,info,log,warn])expect(spy).not.toHaveBeenCalled();
 });
 it.each(['fetch','body'] as const)('aborts %s at 8s, bounds global concurrency to four and releases permits',async stage=>{
  vi.useFakeTimers();const signals:AbortSignal[]=[];
  const fetchImpl=vi.fn<typeof fetch>().mockImplementation(async(_url,options)=>{
   const signal=options!.signal!;signals.push(signal);
   if(stage==='fetch')return await new Promise<Response>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));
   return new Response(new ReadableStream({start(controller){signal.addEventListener('abort',()=>controller.error(new Error('aborted')));}}));
  });
  const a=mailer(fetchImpl),b=mailer(fetchImpl);
  const pending=Array.from({length:4},(_,i)=>(i%2?a:b).send(message));
  expect(await a.send(message)).toBe('failed');expect(fetchImpl).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(8000);
  expect(await Promise.all(pending)).toEqual(Array(4).fill('unknown'));
  expect(signals.every(signal=>signal.aborted)).toBe(true);
  expect(await mailer(vi.fn<typeof fetch>().mockResolvedValue(Response.json({id:'next'}))).send(message)).toBe('accepted');
 });
 it('rejects redirect/network ambiguity without retry',async()=>{
  const fetchImpl=vi.fn<typeof fetch>().mockRejectedValue(new TypeError('redirect prohibited'));
  expect(await mailer(fetchImpl).send(message)).toBe('unknown');expect(fetchImpl).toHaveBeenCalledTimes(1);
 });
});
