import tls from 'node:tls';
import net from 'node:net';
import {mkdtemp,chmod,readFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
export async function certificate(){
 const dir=await mkdtemp(join(tmpdir(),'n7-author-i1-tls-')); await chmod(dir,0o700);
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=fixture.invalid','-addext','subjectAltName=DNS:fixture.invalid'],{stdio:'ignore'});
 await chmod(join(dir,'key.pem'),0o600);
 return {key:await readFile(join(dir,'key.pem')),cert:await readFile(join(dir,'cert.pem')),cleanup:()=>rm(dir,{recursive:true,force:true})};
}
export const MIME=Buffer.from('Message-ID: <n7-prototype@fixture.invalid>\r\nList-Unsubscribe: <mailto:stop@fixture.invalid>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nПривет\r\n.leading dot\r\n');
export async function fixture(protocol,scenario,credentials){
 const starttls=scenario.startsWith('starttls-');scenario=scenario.replace(/^starttls-/, '');
 const state={sentBytes:0,literalAdvertised:0,accepted:0,closed:0,commands:[],auth:0,plaintextAuth:0,recipients:0,bytes:0,sni:[],body:null,terminator:false};
 const sockets=new Set(),timers=new Set();
 const schedule=(fn,ms)=>{const t=setTimeout(()=>{timers.delete(t);fn();},ms);timers.add(t);};
 function handle(socket,greet=true){
  if(socket.encrypted){if(socket.servername)state.sni.push(socket.servername);else socket.once('secure',()=>state.sni.push(socket.servername||null));} socket.on('error',()=>{});
  let pending=Buffer.alloc(0),dataMode=false,body=[];
  const write=text=>{if(!socket.destroyed){state.sentBytes+=Buffer.byteLength(text);socket.write(text);}};
  if(scenario==='stall-connect')return;
  if(greet)write(protocol==='imap'?'* OK fixture\r\n':'220 fixture ESMTP\r\n');
  socket.on('data',chunk=>{
   pending=Buffer.concat([pending,chunk]);
   if(dataMode){
    state.bytes+=chunk.length;
    if(scenario==='drop-body'){socket.destroy();return;}
    const end=pending.indexOf('\r\n.\r\n');
    if(end<0)return;
    state.terminator=true; state.body=pending.subarray(0,end+2).toString().replace(/^\.\./gm,'.');pending=pending.subarray(end+5);dataMode=false;
    if(scenario==='drop-final'){socket.destroy();return;}
    if(scenario==='stall-final')return;
    if(scenario==='trickle-final'){const chars='250 accepted\r\n';let n=0;const pump=()=>{if(socket.destroyed||n>=chars.length)return;write(chars[n++]);schedule(pump,100);};pump();return;}
    if(scenario==='malformed-final'){write('250 incomplete');socket.end();return;}
    write(scenario==='final-450'?'450 rejected\r\n':scenario==='final-550'?'550 rejected\r\n':'250 accepted\r\n');
   }
   for(;;){const end=pending.indexOf('\r\n');if(end<0)return;const line=pending.subarray(0,end).toString();pending=pending.subarray(end+2);
    if(protocol==='smtp'){
     const verb=line.split(' ')[0].toUpperCase();state.commands.push(verb);
     if(verb==='EHLO')write(socket.encrypted?'250-fixture\r\n250 AUTH PLAIN\r\n':'250-fixture\r\n250 STARTTLS\r\n');
     else if(verb==='STARTTLS'){write('220 upgrade\r\n');socket.removeAllListeners('data');const secure=new tls.TLSSocket(socket,{isServer:true,key:credentials.key,cert:credentials.cert,minVersion:'TLSv1.2'});handle(secure,false);return;}
     else if(verb==='AUTH'){state.auth++;if(!socket.encrypted)state.plaintextAuth++;if(scenario!=='stall-auth')write('235 authenticated\r\n');}
     else if(verb==='MAIL')write('250 sender\r\n');
     else if(verb==='RCPT'){state.recipients++;write('250 recipient\r\n');}
     else if(verb==='DATA'){
      if(scenario==='drop-pre'){socket.destroy();return;}
      if(scenario==='data-450'||scenario==='data-550'){write(scenario==='data-450'?'450 refused\r\n':'550 refused\r\n');continue;}
      dataMode=true;write('354 send\r\n');return;
     }else if(verb==='QUIT'){write('221 bye\r\n');socket.end();}
    }else{
     if(state.authTag){write(state.authTag+' OK authenticated\r\n');delete state.authTag;continue;}
     const [tag,verb,...rest]=line.split(' ');if(!verb)continue;const command=verb.toUpperCase();
     // Never retain authentication parameters or arbitrary peer content.
     state.commands.push(command==='UID'?'UID '+rest.join(' '):command);
     if(command==='CAPABILITY')write('* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\n'+tag+' OK capability\r\n');
     else if(command==='AUTHENTICATE'){state.auth++; if(scenario==='stall-auth')continue;if(rest.length===1){write('+ \r\n');state.authTag=tag;}else write(tag+' OK authenticated\r\n');}
     else if(state.authTag){write(state.authTag+' OK authenticated\r\n');delete state.authTag;}
     else if(command==='LOGIN'){state.auth++;write(tag+' OK authenticated\r\n');}
     else if(command==='LIST')write('* LIST () "/" "INBOX"\r\n'+tag+' OK list\r\n');
     else if(command==='EXAMINE'||command==='SELECT')write('* 2 EXISTS\r\n* OK [UIDVALIDITY '+(scenario==='changed-uid'?'8':'7')+'] validity\r\n* OK [UIDNEXT 10] next\r\n'+tag+' OK [READ-ONLY] opened\r\n');
     else if(command==='UID'){
      if(scenario==='aggregate-receive'){const small='* OK '+ 'x'.repeat(1024)+'\r\n';for(let n=0;n<1100;n++)write(small);}
      if(scenario==='stall-literal'||scenario==='trickle-literal'){write('* 1 FETCH (UID 3 BODY[1]<0> {100}\r\n');if(scenario==='trickle-literal'){const pump=()=>{if(socket.destroyed)return;write('a');schedule(pump,50);};pump();}continue;}
      if(scenario==='advertised'||scenario==='ignore-partial'){
       const size=scenario==='advertised'?67108864:8388608;state.literalAdvertised=size;write('* 1 FETCH (UID 3 BODY[1]<0> {'+size+'}\r\n');
       if(scenario==='advertised')write(Buffer.alloc(1024,65));
       else {let sent=0;const pump=()=>{if(socket.destroyed||sent>=size)return;sent+=16384;write(Buffer.alloc(16384,65));schedule(pump,2);};pump();}
       continue;
      }
      const text='hello';const metadata=scenario==='oversized-metadata'?'x'.repeat(9000):scenario==='unsupported-mime'?'Content-Type: application/pdf\r\n':'Content-Type: text/plain\r\n';const uid=scenario==='out-of-range'?999:3;
      write('* 1 FETCH (UID '+uid+' BODY[1.MIME]<0> {'+Buffer.byteLength(metadata)+'}\r\n'+metadata+' BODY[1]<0> {'+text.length+'}\r\n'+text+')\r\n');
      if(scenario==='duplicate')write('* 2 FETCH (UID 3 BODY[1]<0> {5}\r\nhello)\r\n');
      if(scenario==='no-tag'){socket.end();return;}write(tag+' OK fetched\r\n');
     }else if(command==='LOGOUT'){write('* BYE closing\r\n'+tag+' OK logout\r\n');socket.end();}
     else write(tag+' OK done\r\n');
    }
   }
  });
 }
 const server=scenario==='stall-tls'?net.createServer(socket=>socket.on('error',()=>{})):starttls?net.createServer(handle):tls.createServer({key:credentials.key,cert:credentials.cert,minVersion:'TLSv1.2'},handle);
 server.on('tlsClientError',()=>{});server.on('connection',socket=>{state.accepted++;sockets.add(socket);socket.on('close',()=>{state.closed++;sockets.delete(socket);});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {port:server.address().port,state,async close(){for(const t of timers)clearTimeout(t);timers.clear();for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve));await new Promise(resolve=>setTimeout(resolve,20));return {sockets:sockets.size,timers:timers.size,listening:server.listening};}};
}
