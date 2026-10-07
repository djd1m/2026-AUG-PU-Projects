import type { MailboxInput } from './input.js';
import type { LiveMessage } from '../dispatch/message.js';
import { submitSmtp } from '../dispatch/smtp.js';
import { imapRead,imapSnapshot } from '../replies/imap.js';
import type { ChildRequest } from './transport-lifetime.js';
import { readImapBodyStage,TransportFailure,type TransportFixture } from './transport-channel.js';
// This process alone owns transport descriptors. It never spawns or transfers handles.
process.once('message',async(value:unknown)=>{
 const r=value as ChildRequest;const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());
 try{
  if(!r||!['smtp','snapshot','read','body_metadata','body_text'].includes(r.kind))throw new Error();
  const fixture:TransportFixture|undefined=r.fixture?{ca:r.fixture.ca,resolver:async()=>[{address:'8.8.8.8',family:4}],dial:(_address,port)=>({address:r.fixture!.address,port:port===465?r.fixture!.smtp465:port===587?r.fixture!.smtp587:r.fixture!.imap993})}:undefined;
  const allowlist=new Map(r.allowlist),input=r.input as MailboxInput;
  const result=r.kind==='body_metadata'||r.kind==='body_text'?await readImapBodyStage(input,allowlist,r.validity!,r.uid!,r.kind,controller.signal,fixture,r.deadline):r.kind==='smtp'?await submitSmtp(input,r.message as LiveMessage,allowlist,controller.signal,fixture):r.kind==='snapshot'?await imapSnapshot(input,allowlist,controller.signal,fixture):await imapRead(input,allowlist,r.validity!,r.cursor!,r.horizon!,controller.signal,fixture);
  process.send?.({ok:true,result},()=>{process.disconnect();});
 }catch(error){process.send?.({ok:false,code:error instanceof TransportFailure?error.code:'transport_child_failed'},()=>{process.disconnect();});}
});
