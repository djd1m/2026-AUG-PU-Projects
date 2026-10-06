import {appendFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import type { MailboxInput } from '/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup/src/mailboxes/input.ts';
import type { LiveMessage } from '/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup/src/dispatch/message.ts';
import { submitSmtp } from '/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup/src/dispatch/smtp.ts';
import { imapRead,imapSnapshot } from '/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup/src/replies/imap.ts';
import type { ChildRequest } from '/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup/src/mailboxes/transport-lifetime.ts';
import type { TransportFixture } from '/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup/src/mailboxes/transport-channel.ts';
// This process alone owns transport descriptors. It never spawns or transfers handles.
process.once('message',async(value:unknown)=>{
 const r=value as ChildRequest;const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());
 try{
  if(!r||!['smtp','snapshot','read'].includes(r.kind))throw new Error();
  const fixture:TransportFixture|undefined=r.fixture?{ca:r.fixture.ca,resolver:async()=>[{address:'8.8.8.8',family:4}],dial:(_address,port)=>({address:r.fixture!.address,port:port===465?r.fixture!.smtp465:port===587?r.fixture!.smtp587:r.fixture!.imap993})}:undefined;
  const allowlist=new Map(r.allowlist),input=r.input as MailboxInput;
  const result=r.kind==='smtp'?await submitSmtp(input,r.message as LiveMessage,allowlist,controller.signal,fixture):r.kind==='snapshot'?await imapSnapshot(input,allowlist,controller.signal,fixture):await imapRead(input,allowlist,r.validity!,r.cursor!,r.horizon!,controller.signal,fixture);
  process.send?.({ok:true,result},()=>{process.disconnect();});
 }catch(error){const e=error as {code?:string;reason?:string;message?:string};appendFileSync('/tmp/n7-f10-verify-a13/child-error.jsonl',JSON.stringify({at:new Date().toISOString(),pid:process.pid,kind:r?.kind,errorClass:error?.constructor?.name,code:['protocol_invalid','transport_cancelled','transport_timeout','transport_denied'].includes(e?.code??e?.reason??'')?e.code??e.reason:null,messageSHA:createHash('sha256').update(e?.message??'').digest('hex'),signalAborted:controller.signal.aborted,validity:r?.validity,cursor:r?.cursor,horizon:r?.horizon})+'\n');process.send?.({ok:false},()=>{process.disconnect();});}
});
