import {afterAll,beforeAll,describe,it,expect} from 'vitest';
import {createServer,type TLSSocket} from 'node:tls';
import type {AddressInfo} from 'node:net';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {SupportMailer,createSMTPTransport} from '../apps/web/src/server/support/mail';
let directory:string,key:Buffer,cert:Buffer;
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),'n5-support-smtp-test-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 key=await readFile(join(directory,'key.pem'));cert=await readFile(join(directory,'cert.pem'));
});
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
async function fixture(mode:'accept'|'auth-fail'|'stall'|'trickle') {
 const sockets=new Set<TLSSocket>();let authenticated=0,accepted=0,connections=0,maximum=0;
 const intervals=new Set<ReturnType<typeof setInterval>>();
 const server=createServer({key,cert},socket=>{
  sockets.add(socket);connections++;maximum=Math.max(maximum,sockets.size);
  socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));
  if(mode==='stall')return;
  socket.write('220 localhost synthetic\r\n');let buffer='',data=false;
  socket.on('data',chunk=>{
   buffer+=chunk.toString();let next:number;
   while((next=buffer.indexOf('\r\n'))>=0) {
    const line=buffer.slice(0,next);buffer=buffer.slice(next+2);
    if(data){if(line==='.'){data=false;
      if(mode==='trickle') {const timer=setInterval(()=>socket.write('250-synthetic still waiting\r\n'),500);intervals.add(timer);socket.on('close',()=>{clearInterval(timer);intervals.delete(timer);});}
      else {accepted++;socket.write('250 accepted synthetic\r\n');}
    }continue;}
    if(line.startsWith('EHLO'))socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
    else if(line.startsWith('AUTH PLAIN ')) {
      if(mode==='auth-fail'||Buffer.from(line.slice(11),'base64').toString()!=='\0synthetic\0synthetic-password')socket.write('535 rejected\r\n');
      else{authenticated++;socket.write('235 authenticated\r\n');}
    }else if(line.startsWith('MAIL FROM:')||line.startsWith('RCPT TO:'))socket.write('250 OK\r\n');
    else if(line==='DATA'){data=true;socket.write('354 send data\r\n');}
    else if(line==='QUIT'){socket.end('221 bye\r\n');}
    else socket.write('250 OK\r\n');
   }
  });
 });
 server.on('tlsClientError',()=>{});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=(server.address() as AddressInfo).port;
 const config={mode:'smtp' as const,host:'127.0.0.1',port,secure:true,user:'synthetic',password:'synthetic-password',from:'sender@example.test'};
 return {config,stats:()=>({authenticated,accepted,connections,maximum,active:sockets.size}),close:async()=>{
   for(const timer of intervals)clearInterval(timer);for(const socket of sockets)socket.destroy();
   await new Promise<void>(resolve=>server.close(()=>resolve()));
 }};
}
const message={to:'recipient@example.test',url:'https://test.invalid/reset#token=synthetic',purpose:'reset' as const};
const trusted=(options:object)=>createSMTPTransport({...options,tls:{ca:cert,servername:'localhost'}});
describe('actual Nodemailer local TLS boundary',()=>{
 it('validates TLS and authenticates before accepting one synthetic MIME message',async()=>{
  const f=await fixture('accept');try{expect(await new SupportMailer(f.config,undefined,trusted).send(message)).toBe('accepted');expect(f.stats().authenticated).toBe(1);expect(f.stats().accepted).toBe(1);}finally{await f.close();}
 });
 it('rejects untrusted TLS without AUTH or message acceptance',async()=>{
  const f=await fixture('accept');try{expect(await new SupportMailer(f.config).send(message)).toBe('unknown');expect(f.stats().authenticated).toBe(0);expect(f.stats().accepted).toBe(0);}finally{await f.close();}
 });
 it('authentication failure has no retry',async()=>{
  const f=await fixture('auth-fail');try{expect(await new SupportMailer(f.config,undefined,trusted).send(message)).toBe('unknown');expect(f.stats().connections).toBe(1);expect(f.stats().accepted).toBe(0);}finally{await f.close();}
 });
 it('four actual TLS sends stop at total 8000ms despite trickle traffic; fifth fails fast and sockets close',async()=>{
  const f=await fixture('trickle');try{
   const mailer=new SupportMailer(f.config,undefined,trusted),start=Date.now();
   const second=new SupportMailer(f.config,undefined,trusted);
   const pending=Array.from({length:4},(_,i)=>(i%2?second:mailer).send(message));
   expect(await mailer.send(message)).toBe('failed');expect(Date.now()-start).toBeLessThan(500);
   expect(await Promise.all(pending)).toEqual(['unknown','unknown','unknown','unknown']);
   expect(Date.now()-start).toBeGreaterThanOrEqual(7900);expect(Date.now()-start).toBeLessThan(9000);
   await new Promise(resolve=>setTimeout(resolve,100));expect(f.stats().maximum).toBe(4);expect(f.stats().active).toBe(0);expect(f.stats().connections).toBe(4);
  }finally{await f.close();}
 });
});
