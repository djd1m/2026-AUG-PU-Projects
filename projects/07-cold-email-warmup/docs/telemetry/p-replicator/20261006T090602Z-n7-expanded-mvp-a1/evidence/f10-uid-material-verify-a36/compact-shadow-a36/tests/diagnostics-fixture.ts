import { createServer as tlsServer, type TlsOptions } from 'node:tls';
import { createServer as netServer, type Socket } from 'node:net';
import { TLSSocket } from 'node:tls';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:net';
import { fixtureChannel } from '../src/mailboxes/diagnostic-channel.js';
export function certificates(){
 const directory=mkdtempSync(join(tmpdir(),'n7-diagnostic-cert-'));const key=join(directory,'key.pem'),cert=join(directory,'cert.pem');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=smtp.gmail.com','-addext','subjectAltName=DNS:smtp.gmail.com,DNS:imap.gmail.com'],{stdio:'ignore'});
 const result={key:readFileSync(key),cert:readFileSync(cert)};rmSync(directory,{recursive:true});return result;
}
export interface FixtureBehavior {smtpReject?:boolean;imapReject?:boolean;noStarttls?:boolean;noPostTlsPlain?:boolean;preauth?:boolean;hostile?:string;oversize?:boolean;stall?:boolean;wrongTag?:boolean;holdAuth?:()=>Promise<void>;onReady?:()=>void}
export async function protocolFixture(behavior:FixtureBehavior={},options?:TlsOptions,providedCertificate?:{key:Buffer;cert:Buffer}){
 const cert=providedCertificate??certificates();const verbs:string[]=[];const sockets=new Set<Socket>();const servers:Server[]=[];
 const tlsOptions={...cert,...options};
 const watch=(socket:Socket)=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));};
 const speak=(socket:Socket,protocol:'smtp'|'imap',starttls=false)=>{
  watch(socket);behavior.onReady?.();if(behavior.stall)return;
  if(behavior.oversize){socket.write(Buffer.alloc(65537,65));return;}
  socket.write(protocol==='smtp'?'220 ready\r\n':behavior.preauth?'* PREAUTH ready\r\n':'* OK ready\r\n');let pending='';let authenticating=false;
  socket.on('data',(chunk:Buffer)=>{pending+=chunk.toString();for(;;){const index=pending.indexOf('\r\n');if(index<0)break;const line=pending.slice(0,index);pending=pending.slice(index+2);
   const verb=authenticating?'AUTH_RESPONSE':line.split(' ')[protocol==='smtp'?0:1]!;verbs.push(verb.toUpperCase());
   if(protocol==='smtp'){
    if(/^EHLO /.test(line))socket.write(starttls?(behavior.noStarttls?'250 AUTH PLAIN\r\n':'250-peer\r\n250 STARTTLS\r\n'):behavior.noPostTlsPlain?'250 AUTH LOGIN\r\n':'250-peer\r\n250 AUTH PLAIN\r\n');
    else if(line==='STARTTLS'){if(behavior.noStarttls){socket.write('454 unavailable\r\n');continue;}socket.removeAllListeners('data');socket.write('220 upgrade\r\n',()=>{const secured=new TLSSocket(socket,{isServer:true,...tlsOptions});watch(secured);let inner='';secured.on('data',chunk=>{inner+=chunk.toString();for(;;){const index=inner.indexOf('\r\n');if(index<0)break;const line=inner.slice(0,index);inner=inner.slice(index+2);verbs.push(line.split(' ')[0]!);if(line.startsWith('EHLO '))secured.write(behavior.noPostTlsPlain?'250 AUTH LOGIN\r\n':'250 AUTH PLAIN\r\n');else if(line.startsWith('AUTH PLAIN '))void Promise.resolve(behavior.holdAuth?.()).then(()=>secured.write(behavior.smtpReject?'535 '+(behavior.hostile??'rejected')+'\r\n':'235 authenticated\r\n'));else secured.destroy();}});});return;}
    else if(line.startsWith('AUTH PLAIN '))void Promise.resolve(behavior.holdAuth?.()).then(()=>socket.write(behavior.smtpReject?'535 '+(behavior.hostile??'rejected')+'\r\n':'235 authenticated\r\n'));else socket.destroy();
   }else{
    if(line==='a1 CAPABILITY')socket.write('* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\na1 OK done\r\n');
    else if(line==='a2 AUTHENTICATE PLAIN'){authenticating=true;socket.write('+ challenge\r\n');}
    else if(authenticating){authenticating=false;socket.write((behavior.wrongTag?'other': 'a2')+(behavior.imapReject?' NO '+(behavior.hostile??'rejected'):' OK authenticated')+'\r\n');}else socket.destroy();
   }
  }});
 };
 const implicit=tlsServer(tlsOptions,s=>speak(s,'smtp'));const plain=netServer(s=>speak(s,'smtp',true));const imap=tlsServer(tlsOptions,s=>speak(s,'imap'));
 for(const server of [implicit,plain,imap]){servers.push(server);server.on('error',()=>{});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));}
 const port=(s:Server)=>(s.address() as {port:number}).port;
 const connector=fixtureChannel({ca:cert.cert,resolver:async()=>[{address:'8.8.8.8',family:4}],dial:(_address,endpointPort)=>({address:'127.0.0.1',port:endpointPort===465?port(implicit):endpointPort===587?port(plain):port(imap)})});
 return {connector,verbs,cert,ports:[port(implicit),port(plain),port(imap)],sockets,async close(){for(const socket of sockets)socket.destroy();await Promise.all(servers.map(s=>new Promise<void>(r=>s.close(()=>r()))));}};
}
export const diagnosticInput={label:'Fixture',senderAddress:'fixture@example.com',smtpHost:'smtp.gmail.com',smtpPort:465 as const,imapHost:'imap.gmail.com',imapPort:993 as const,requiredTLS:true,smtpUsername:'CREDENTIAL_USERNAME_CANARY',smtpPassword:'CREDENTIAL_PASSWORD_CANARY',imapUsername:'CREDENTIAL_USERNAME_CANARY',imapPassword:'CREDENTIAL_PASSWORD_CANARY',dailyLimit:10};
