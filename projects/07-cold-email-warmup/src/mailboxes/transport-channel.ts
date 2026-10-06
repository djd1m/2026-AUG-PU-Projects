import { connect,type Socket,isIP } from 'node:net';
import { connect as secure,type TLSSocket } from 'node:tls';
import { performance } from 'node:perf_hooks';
import { publicResolver,isPublicIp,normalizeHost,type Resolver } from './network.js';
export class TransportFailure extends Error {constructor(readonly code:'timeout'|'cancelled'|'connection_failed'|'tls_failed'|'protocol_invalid'|'response_size'|'dns_unavailable'|'unsafe_address'|'host_denied'){super(code);}}
export interface TransportFixture {ca:Buffer|string;resolver:Resolver;dial:(address:string,port:number)=>{address:string;port:number}}
export class TransportBudget {
 readonly deadline:number;private active=0;
 resources(){return {timers:this.active,abortListeners:this.active};}
 constructor(readonly signal:AbortSignal,milliseconds:number){this.deadline=performance.now()+milliseconds;}
 async phase<T>(operation:()=>Promise<T>,limit=10000):Promise<T>{
  if(this.signal.aborted)throw new TransportFailure('cancelled');const left=Math.min(limit,this.deadline-performance.now());if(left<=0)throw new TransportFailure('timeout');
  let timer:NodeJS.Timeout|undefined;let abort:()=>void=()=>{};
  try{return await Promise.race([operation(),new Promise<never>((_,reject)=>{abort=()=>reject(new TransportFailure('cancelled'));this.active++;this.signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>reject(new TransportFailure('timeout')),left);})]);}
  finally{if(timer){clearTimeout(timer);this.active--;}this.signal.removeEventListener('abort',abort);}
 }
}
export class TransportChannel {
 private raw:Socket|undefined;private tls:TLSSocket|undefined;private current:Socket|undefined;
 private buffer=Buffer.alloc(0);private received=0;private sealed=false;private failure:TransportFailure|undefined;
 private drainWaits=0;
 private wake:(()=>void)|undefined;private sockets=new Set<Socket>();
 private abort=()=>this.fail(new TransportFailure('cancelled'));
 private data=(chunk:Buffer)=>{if(this.received+chunk.length>this.maximum||this.buffer.length+chunk.length>131072){this.fail(new TransportFailure('response_size'));return;}this.received+=chunk.length;this.buffer=Buffer.concat([this.buffer,chunk]);if(this.buffer.length>65536)this.current?.pause();this.wake?.();};
 private error=()=>this.fail(new TransportFailure(this.tls?'tls_failed':'connection_failed'));
 private end=()=>this.fail(new TransportFailure('connection_failed'));
 constructor(readonly budget:TransportBudget,private maximum:number,private fixture?:TransportFixture){budget.signal.addEventListener('abort',this.abort,{once:true});}
 private fail(e:TransportFailure){this.failure??=e;this.wake?.();for(const socket of this.sockets)socket.destroy();}
 private attach(socket:Socket){this.current=socket;this.sockets.add(socket);socket.on('data',this.data);socket.on('error',this.error);socket.on('end',this.end);socket.on('close',this.end);}
 private detach(socket:Socket){socket.removeListener('data',this.data);socket.removeListener('error',this.error);socket.removeListener('end',this.end);socket.removeListener('close',this.end);}
 private check(){if(this.sealed||this.budget.signal.aborted)throw new TransportFailure('cancelled');if(this.failure)throw this.failure;}
 async open(host:string,port:number,allowlist:ReadonlyMap<string,number>){
  this.check();host=normalizeHost(host);if(!allowlist.has(host))throw new TransportFailure('host_denied');
  let addresses:Awaited<ReturnType<Resolver>>;try{addresses=await this.budget.phase(()=>(this.fixture?.resolver??publicResolver)(host));}catch(e){throw e instanceof TransportFailure?e:new TransportFailure('dns_unavailable');}
  if(!addresses.length||addresses.length>32||addresses.some(a=>!isPublicIp(a.address)||isIP(a.address)!==a.family))throw new TransportFailure('unsafe_address');this.check();
  const chosen=addresses[0]!,target=this.fixture?.dial(chosen.address,port)??{address:chosen.address,port};
  this.raw=connect({host:target.address,port:target.port,family:isIP(target.address)});this.attach(this.raw);
  await this.waitEvent(this.raw,'connect','connection_failed');
 }
 private async waitEvent(socket:Socket,event:string,code:'connection_failed'|'tls_failed'){
  await this.budget.phase(()=>new Promise<void>((resolve,reject)=>{
   const done=()=>{cleanup();resolve();},failed=()=>{cleanup();reject(new TransportFailure(code));};
   const cleanup=()=>{socket.removeListener(event,done);socket.removeListener('error',failed);socket.removeListener('close',failed);};
   socket.once(event,done);socket.once('error',failed);socket.once('close',failed);
  }));
 }
 async upgrade(host:string){this.check();if(!this.raw||this.buffer.length)throw new TransportFailure('protocol_invalid');this.detach(this.raw);
  this.tls=secure({socket:this.raw,servername:host,rejectUnauthorized:true,minVersion:'TLSv1.2',...(this.fixture?{ca:this.fixture.ca}:{})});this.attach(this.tls);
  await this.waitEvent(this.tls,'secureConnect','tls_failed');if(!this.tls.authorized)throw new TransportFailure('tls_failed');
 }
 private async available(){this.check();await new Promise<void>(resolve=>{this.wake=resolve;});this.wake=undefined;this.check();}
 private consume(count:number){const value=this.buffer.subarray(0,count);this.buffer=this.buffer.subarray(count);if(this.buffer.length<32768)this.current?.resume();return value;}
 async line(limit=10000):Promise<string>{return this.budget.phase(async()=>{for(;;){this.check();const end=this.buffer.indexOf('\r\n');if(end>=0){if(end+2>8192)throw new TransportFailure('response_size');const b=this.consume(end+2).subarray(0,end);if(b.includes(0)||b.includes(10)||b.includes(13))throw new TransportFailure('protocol_invalid');return b.toString('utf8');}if(this.buffer.length>8192)throw new TransportFailure('response_size');await this.available();}},limit);}
 async literal(length:number,limit=8192):Promise<Buffer>{if(!Number.isInteger(limit)||limit<0||limit>32769||!Number.isInteger(length)||length<0||length>limit)throw new TransportFailure('response_size');return this.budget.phase(async()=>{while(this.buffer.length<length)await this.available();return Buffer.from(this.consume(length));});}
 async write(bytes:string|Buffer){this.check();await this.budget.phase(()=>new Promise<void>((resolve,reject)=>{const socket=this.current;if(!socket){reject(new TransportFailure('connection_failed'));return;}if(socket.write(bytes)){resolve();return;}this.drainWaits++;const done=()=>{cleanup();resolve();},failed=()=>{cleanup();reject(new TransportFailure('connection_failed'));};const cleanup=()=>{socket.removeListener('drain',done);socket.removeListener('error',failed);socket.removeListener('close',failed);};socket.once('drain',done);socket.once('error',failed);socket.once('close',failed);}));}
 resources(){return {sockets:[...this.sockets].filter(s=>!s.closed).length,queuedBytes:this.buffer.length,pending:this.wake?1:0,drainWaits:this.drainWaits,listeners:[...this.sockets].reduce((n,s)=>n+s.listenerCount('data')+s.listenerCount('drain'),0),...this.budget.resources()};}
 async command(line:string){if(/[\r\n\0]/.test(line))throw new TransportFailure('protocol_invalid');await this.write(line+'\r\n');}
 async close(){if(this.sealed)return;this.sealed=true;this.budget.signal.removeEventListener('abort',this.abort);this.wake?.();
  const sockets=[...this.sockets];await Promise.all(sockets.map(socket=>new Promise<void>(resolve=>{this.detach(socket);if(socket.closed){resolve();return;}socket.once('close',()=>resolve());socket.on('error',()=>{});socket.destroy();})));this.buffer=Buffer.alloc(0);this.sockets.clear();
 }
}

// Body stages have a separate five-second budget and explicit sentinel limit.
// Header callers keep the default 8192-byte literal cap.
export async function readImapBodyStage(input:import('./input.js').MailboxInput,allowlist:ReadonlyMap<string,number>,expected:string,targetUid:number,stage:'body_metadata'|'body_text',signal:AbortSignal,fixture?:TransportFixture):Promise<Buffer>{
 if(!/^[1-9]\d{0,9}$/.test(expected)||!Number.isInteger(targetUid)||targetUid<1||targetUid>4294967295)throw new TransportFailure('protocol_invalid');
 const c=new TransportChannel(new TransportBudget(signal,5000),65536,fixture),invalid=()=>new TransportFailure('protocol_invalid');
 try{
  await c.open(input.imapHost,993,allowlist);await c.upgrade(input.imapHost);if(!/^\* OK(?: |$)/i.test(await c.line()))throw invalid();
  await c.command('a1 CAPABILITY');let plain=false,version=false;
  for(;;){const l=await c.line();if(/^\* CAPABILITY /i.test(l)){const t=l.toUpperCase().split(' ');plain=t.includes('AUTH=PLAIN');version=t.includes('IMAP4REV1')||t.includes('IMAP4REV2');continue;}if(/^a1 OK(?: |$)/i.test(l))break;throw invalid();}
  if(!plain||!version)throw invalid();await c.command('a2 AUTHENTICATE PLAIN');if(!/^\+(?: |$)/.test(await c.line()))throw invalid();await c.command(Buffer.from('\0'+input.imapUsername+'\0'+input.imapPassword).toString('base64'));if(!/^a2 OK(?: |$)/i.test(await c.line()))throw invalid();
  await c.command('a3 EXAMINE INBOX');let found=false;
  for(;;){const l=await c.line(),v=/^\* OK \[UIDVALIDITY ([1-9]\d*)\]/i.exec(l);if(v){if(found||v[1]!==expected)throw invalid();found=true;continue;}if(/^a3 OK(?: |$)/i.test(l)){if(!found||!/\[READ-ONLY\]/i.test(l))throw invalid();break;}if(!/^\* (?:\d+ (?:EXISTS|RECENT)|FLAGS |OK )/i.test(l)||/\{\d+\+?\}$/.test(l))throw invalid();}
  const section=stage==='body_metadata'?'HEADER.FIELDS (CONTENT-TYPE CONTENT-TRANSFER-ENCODING CONTENT-DISPOSITION)':'TEXT',partial=stage==='body_text'?'<0.32769>':'';
  await c.command(`a4 UID FETCH ${targetUid} (UID BODY.PEEK[${section}]${partial})`);
  const line=await c.line(),prefix=/^\* [1-9]\d* FETCH \(UID ([1-9]\d*) BODY\[(.+)\](?:<0>)? \{(\d+)\}$/i.exec(line);
  if(!prefix||Number(prefix[1])!==targetUid||prefix[2]!.toUpperCase()!==section)throw invalid();
  const bytes=await c.literal(Number(prefix[3]),stage==='body_text'?32769:8192);
  if(await c.line()!==')'||!/^a4 OK(?: |$)/i.test(await c.line()))throw invalid();return bytes;
 }finally{await c.close();}
}
