import { connect, type Socket } from 'node:net';
import { connect as secure, type TLSSocket } from 'node:tls';
import { performance } from 'node:perf_hooks';
import { isPublicIp, normalizeHost, publicResolver, type Resolver } from './network.js';
import { isIP } from 'node:net';
export type FailureCode='dns_unavailable'|'unsafe_address'|'host_denied'|'timeout'|'cancelled'|'connection_failed'|'tls_failed'|'response_size'|'protocol_invalid'|'auth_unsupported'|'auth_rejected';
export class DiagnosticFailure extends Error { constructor(readonly code:FailureCode){super(code);} }
export class Budget {
 readonly deadline:number;
 constructor(readonly signal:AbortSignal,milliseconds=30000){this.deadline=performance.now()+milliseconds;}
 async phase<T>(op:()=>Promise<T>):Promise<T>{
  if(this.signal.aborted) throw new DiagnosticFailure('cancelled');
  const remaining=Math.min(10000,this.deadline-performance.now());
  if(remaining<=0) throw new DiagnosticFailure('timeout');
  let timer:NodeJS.Timeout|undefined; let abort:()=>void=()=>{};
  try { return await Promise.race([op(),new Promise<never>((_,reject)=>{
   abort=()=>reject(new DiagnosticFailure('cancelled'));this.signal.addEventListener('abort',abort,{once:true});
   timer=setTimeout(()=>reject(new DiagnosticFailure('timeout')),remaining);
  })]); } finally {if(timer)clearTimeout(timer);this.signal.removeEventListener('abort',abort);}
 }
}
// Byte counters run before decoding, and never retain more than one bounded line.
export class LineBuffer {
 total=0; private bytes:number[]=[]; private cr=false;
 push(chunk:Buffer):string[]{
  if(this.total+chunk.length>65536)throw new DiagnosticFailure('response_size');this.total+=chunk.length;
  const result:string[]=[];
  for(const byte of chunk){
   if(this.bytes.length+1>8192)throw new DiagnosticFailure('response_size');
   this.bytes.push(byte);
   if(this.cr){if(byte!==10)throw new DiagnosticFailure('protocol_invalid');result.push(Buffer.from(this.bytes.slice(0,-2)).toString('utf8'));this.bytes=[];this.cr=false;}
   else if(byte===13)this.cr=true;
   else if(byte===10 || byte===0)throw new DiagnosticFailure('protocol_invalid');
  }return result;
 }
 get incomplete(){return this.bytes.length>0;}
}
interface FixtureOptions {ca:string|Buffer; dial:(address:string,port:number)=>{address:string;port:number};resolver:Resolver}
export class Channel {
 private raw:Socket|undefined;private tls:TLSSocket|undefined;private current:Socket|undefined;
 private parser=new LineBuffer();private queue:string[]=[];
 private pending:{resolve:(line:string)=>void;reject:(e:DiagnosticFailure)=>void}|undefined;
 private failure:DiagnosticFailure|undefined;private closed=false;
 private abort=()=>this.fail(new DiagnosticFailure('cancelled'));
 private data=(chunk:Buffer)=>{try{for(const line of this.parser.push(chunk)){
  if(this.pending){const pending=this.pending;this.pending=undefined;pending.resolve(line);}else this.queue.push(line);
 }}catch(e){this.fail(e instanceof DiagnosticFailure?e:new DiagnosticFailure('protocol_invalid'));}};
 private error=()=>this.fail(new DiagnosticFailure(this.tls?'tls_failed':'connection_failed'));
 private end=()=>this.fail(new DiagnosticFailure('protocol_invalid'));
 constructor(readonly budget:Budget,private fixture?:FixtureOptions){budget.signal.addEventListener('abort',this.abort,{once:true});}
 private attach(socket:Socket){this.current=socket;socket.on('data',this.data);socket.on('error',this.error);socket.on('end',this.end);socket.on('close',this.end);}
 private detach(socket:Socket){socket.removeListener('data',this.data);socket.removeListener('error',this.error);socket.removeListener('end',this.end);socket.removeListener('close',this.end);}
 private fail(error:DiagnosticFailure){if(this.closed)return;this.failure=error;this.pending?.reject(error);this.pending=undefined;this.close();}
 async open(host:string,port:number,allowlist:ReadonlyMap<string,number>){
  host=normalizeHost(host);if(!allowlist.has(host))throw new DiagnosticFailure('host_denied');
  let addresses:Awaited<ReturnType<Resolver>>;
  try{addresses=await this.budget.phase(()=>(this.fixture?.resolver??publicResolver)(host));}catch(e){throw e instanceof DiagnosticFailure?e:new DiagnosticFailure('dns_unavailable');}
  if(!addresses.length||addresses.length>32||addresses.some(a=>!isPublicIp(a.address)||isIP(a.address)!==a.family))throw new DiagnosticFailure('unsafe_address');
  if(this.closed||this.budget.signal.aborted)throw new DiagnosticFailure('cancelled');
  const chosen=addresses[0]!;const target=this.fixture?.dial(chosen.address,port)??{address:chosen.address,port};
  this.raw=connect({host:target.address,port:target.port,family:this.fixture?isIP(target.address):chosen.family});this.attach(this.raw);
  await this.budget.phase(()=>new Promise<void>((resolve,reject)=>{
   const socket=this.raw!;const done=()=>{clean();resolve();};const failed=()=>{clean();reject(new DiagnosticFailure('connection_failed'));};
   const clean=()=>{socket.removeListener('connect',done);socket.removeListener('error',failed);socket.removeListener('close',failed);};
   socket.once('connect',done);socket.once('error',failed);socket.once('close',failed);
  }));
 }
 async upgrade(host:string){
  if(this.failure)throw this.failure;
  if(!this.raw||this.queue.length||this.parser.incomplete)throw new DiagnosticFailure('protocol_invalid');
  this.detach(this.raw);
  this.tls=secure({socket:this.raw,servername:host,rejectUnauthorized:true,minVersion:'TLSv1.2',...(this.fixture?{ca:this.fixture.ca}:{})});this.attach(this.tls);
  await this.budget.phase(()=>new Promise<void>((resolve,reject)=>{
   const socket=this.tls!;const done=()=>{clean();if(socket.authorized)resolve();else reject(new DiagnosticFailure('tls_failed'));};
   const failed=()=>{clean();reject(new DiagnosticFailure('tls_failed'));};
   const clean=()=>{socket.removeListener('secureConnect',done);socket.removeListener('error',failed);socket.removeListener('close',failed);};
   socket.once('secureConnect',done);socket.once('error',failed);socket.once('close',failed);
  }));
 }
 async line(){if(this.failure)throw this.failure;if(this.queue.length)return this.queue.shift()!;
  return this.budget.phase(()=>new Promise<string>((resolve,reject)=>{this.pending={resolve,reject};}));}
 write(command:string){if(this.closed||this.failure)throw this.failure??new DiagnosticFailure('cancelled');this.current!.write(command+'\r\n');}
 close(){if(this.closed)return;this.closed=true;this.budget.signal.removeEventListener('abort',this.abort);
  this.pending?.reject(this.failure??new DiagnosticFailure('cancelled'));this.pending=undefined;
  for(const socket of new Set([this.raw,this.tls]))if(socket){this.detach(socket);socket.destroy();}
  this.queue=[];
 }
}
export type ChannelFactory=(budget:Budget)=>Channel;
export const productionChannel:ChannelFactory=budget=>new Channel(budget);
// Explicit test construction only. No environment, request or production-main selector.
export const fixtureChannel=(options:FixtureOptions):ChannelFactory=>budget=>new Channel(budget,options);
