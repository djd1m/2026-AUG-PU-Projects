import type { MailboxInput } from '../mailboxes/input.js';
import { TransportBudget,TransportChannel,TransportFailure,type TransportFixture } from '../mailboxes/transport-channel.js';
import { uid,validity } from './input.js';
import type { HeaderPage,ReadResult,Snapshot } from './adapter.js';
import { parseTransportHeaders } from './headers.js';
const invalid=()=>new TransportFailure('protocol_invalid');
async function examine(c:TransportChannel,input:MailboxInput,allowlist:ReadonlyMap<string,number>):Promise<Snapshot>{
 await c.open(input.imapHost,993,allowlist);await c.upgrade(input.imapHost);if(!/^\* OK(?: |$)/i.test(await c.line()))throw invalid();
 await c.command('a1 CAPABILITY');let plain=false,version=false;
 await c.budget.phase(async()=>{for(;;){const line=await c.line();if(/^\* CAPABILITY /i.test(line)){const tokens=line.toUpperCase().split(' ');plain=tokens.includes('AUTH=PLAIN');version=tokens.includes('IMAP4REV1')||tokens.includes('IMAP4REV2');continue;}if(/^a1 OK(?: |$)/i.test(line))break;throw invalid();}});
 if(!plain||!version)throw invalid();await c.command('a2 AUTHENTICATE PLAIN');if(!/^\+(?: |$)/.test(await c.line()))throw invalid();await c.command(Buffer.from('\0'+input.imapUsername+'\0'+input.imapPassword).toString('base64'));if(!/^a2 OK(?: |$)/i.test(await c.line()))throw invalid();
 await c.command('a3 EXAMINE INBOX');let v:string|undefined,next:number|undefined,readOnly=false;
 await c.budget.phase(async()=>{for(;;){const line=await c.line();if(/^\* BYE/i.test(line)||/\{\d+\+?\}$/.test(line))throw invalid();
  const vm=/^\* OK \[UIDVALIDITY ([1-9]\d*)\]/i.exec(line),nm=/^\* OK \[UIDNEXT ([1-9]\d*)\]/i.exec(line);
  if(vm){if(v!==undefined)throw invalid();v=validity(vm[1]);continue;}if(nm){if(next!==undefined)throw invalid();next=uid(Number(nm[1]));continue;}
  if(/^a3 OK(?: |$)/i.test(line)){readOnly=/\[READ-ONLY\]/i.test(line);break;}if(/^\* (?:\d+ (?:EXISTS|RECENT)|FLAGS |OK )/i.test(line))continue;throw invalid();
 }});
 if(!v||next===undefined||!readOnly)throw invalid();return {uidvalidity:v,uidNext:next,observedAt:new Date(),provenance:'imap_headers'};
}
export async function imapSnapshot(input:MailboxInput,allowlist:ReadonlyMap<string,number>,signal:AbortSignal,fixture?:TransportFixture){const c=new TransportChannel(new TransportBudget(signal,30000),1048576,fixture);try{return await examine(c,input,allowlist);}finally{await c.close();}}
export async function imapRead(input:MailboxInput,allowlist:ReadonlyMap<string,number>,expectedValidity:string,cursor:number,horizon:number,signal:AbortSignal,fixture?:TransportFixture):Promise<ReadResult>{
 validity(expectedValidity);uid(cursor,true);uid(horizon,true);if(horizon<cursor)throw invalid();const startedAt=new Date(),c=new TransportChannel(new TransportBudget(signal,30000),1048576,fixture);
 try{
  const snapshot=await examine(c,input,allowlist);if(snapshot.uidvalidity!==expectedValidity)return {kind:'uidvalidity_changed',snapshot};if(snapshot.uidNext-1<horizon)throw invalid();
  const hi=Math.min(horizon,cursor+100),headers:HeaderPage['headers']=[],seen=new Set<number>();
  if(hi===cursor)return {kind:'page',page:{uidvalidity:expectedValidity,coveredThrough:hi,headers,startedAt,completedAt:new Date()}};
  await c.command(`a4 UID FETCH ${cursor+1}:${hi} (UID BODY.PEEK[HEADER.FIELDS (FROM MESSAGE-ID IN-REPLY-TO REFERENCES)])`);
  await c.budget.phase(async()=>{for(;;){const line=await c.line();if(/^a4 OK(?: |$)/i.test(line))break;if(/^\* \d+ (?:EXPUNGE|EXISTS|RECENT)$/i.test(line))continue;
   const prefix=/^\* [1-9]\d* FETCH \((?:UID ([1-9]\d*) )?BODY\[HEADER\.FIELDS \(FROM MESSAGE-ID IN-REPLY-TO REFERENCES\)\] \{(\d+)\}$/i.exec(line);if(!prefix)throw invalid();
   const literal=await c.literal(Number(prefix[2])),suffix=await c.line(),end=/^(?: UID ([1-9]\d*))?\)$/.exec(suffix);if(!end)throw invalid();
   if(prefix[1]&&end[1]||!prefix[1]&&!end[1])throw invalid();const n=uid(Number(prefix[1]??end[1]));if(n<=cursor||n>hi||seen.has(n)||headers.length>=100)throw invalid();seen.add(n);headers.push(parseTransportHeaders(n,literal));
  }});
  return {kind:'page',page:{uidvalidity:expectedValidity,coveredThrough:hi,headers,startedAt,completedAt:new Date()}};
 }finally{await c.close();}
}
