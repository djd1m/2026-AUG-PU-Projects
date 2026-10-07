import { performance } from 'node:perf_hooks';
import { createServer,type TLSSocket } from 'node:tls';
import type { Socket } from 'node:net';
import { certificates,diagnosticInput } from './diagnostics-fixture.js';
import type { TransportFixture } from '../src/mailboxes/transport-channel.js';
export const bodyInput=diagnosticInput;
export const bodyAllowlist=new Map([['imap.gmail.com',30]]);
export async function bodyFixture(options:{body?:Buffer;metadata?:Buffer;declared?:number;validity?:string;wrongUid?:boolean;stall?:boolean;headers?:Buffer;phaseDelayMs?:number;mailboxes?:Map<string,{headers:Buffer;body?:Buffer;metadata?:Buffer}>}={}){
 const cert=certificates(),sockets=new Set<Socket>(),commands:string[]=[],wire:{connection:number;mailbox:string;phase:string;utc:string;monotonicMs:number;command?:string}[]=[];let peak=0,sequence=0,bodyActive=0,bodyPeak=0;
 const server=createServer(cert,(socket:TLSSocket)=>{
  const connection=++sequence;let mailbox='',isBody=false;const record=(phase:string,command?:string)=>wire.push({connection,mailbox:options.mailboxes?.has(mailbox)?mailbox:mailbox?'single-fixture':'',phase,command,utc:new Date().toISOString(),monotonicMs:performance.now()});record('socket_open');
  sockets.add(socket);peak=Math.max(peak,sockets.size);socket.on('error',()=>{});socket.once('close',()=>{record('socket_close');sockets.delete(socket);if(isBody)bodyActive--;});if(options.stall)return;socket.write('* OK fixture\r\n');let pending='',auth=false;
  socket.on('data',(chunk:Buffer)=>{pending+=chunk.toString();for(;;){const end=pending.indexOf('\r\n');if(end<0)break;const line=pending.slice(0,end);pending=pending.slice(end+2);if(auth){auth=false;mailbox=Buffer.from(line,'base64').toString().split('\0')[1]??'';record('authenticated');commands.push('AUTH_RESPONSE');socket.write('a2 OK authenticated\r\n');continue;}commands.push(line);record('command_received',line);
   if(line==='a1 CAPABILITY')socket.write('* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\na1 OK done\r\n');
   else if(line==='a2 AUTHENTICATE PLAIN'){auth=true;socket.write('+ challenge\r\n');}
   else if(line==='a3 EXAMINE INBOX')socket.write(`* OK [UIDVALIDITY ${options.validity??'1'}] generation\r\n* OK [UIDNEXT 2] next\r\na3 OK [READ-ONLY] done\r\n`);
   else if(/^a4 UID FETCH \d+:\d+ \(UID BODY.PEEK\[HEADER.FIELDS \(FROM MESSAGE-ID IN-REPLY-TO REFERENCES\)\]\)$/.test(line)){
    const range=/FETCH (\d+):(\d+)/.exec(line)!,headers=Number(range[1])<=1&&Number(range[2])>=1?(options.mailboxes?.get(mailbox)?.headers??options.headers):undefined;
    if(headers){socket.write(`* 1 FETCH (UID 1 BODY[HEADER.FIELDS (FROM MESSAGE-ID IN-REPLY-TO REFERENCES)] {${headers.length}}\r\n`);socket.write(headers);socket.write(')\r\n');}socket.write('a4 OK done\r\n');
   }
   else if(line==='a4 UID FETCH 1 (UID BODY.PEEK[HEADER.FIELDS (CONTENT-TYPE CONTENT-TRANSFER-ENCODING CONTENT-DISPOSITION AUTO-SUBMITTED PRECEDENCE LIST-ID RETURN-PATH SUBJECT)])'||line==='a4 UID FETCH 1 (UID BODY.PEEK[TEXT]<0.32769>)'){
    isBody=true;bodyActive++;bodyPeak=Math.max(bodyPeak,bodyActive);record('phase_start',line);
    const metadata=line.includes('HEADER.FIELDS'),section=metadata?'HEADER.FIELDS (CONTENT-TYPE CONTENT-TRANSFER-ENCODING CONTENT-DISPOSITION AUTO-SUBMITTED PRECEDENCE LIST-ID RETURN-PATH SUBJECT)':'TEXT',bytes=metadata?(options.mailboxes?.get(mailbox)?.metadata??options.metadata??Buffer.from('Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n')):(options.mailboxes?.get(mailbox)?.body??options.body??Buffer.from('What does the product do?'));
    const send=()=>{record('phase_response',line);socket.write(`* 1 FETCH (UID ${options.wrongUid?2:1} BODY[${section}]${metadata?'':'<0>'} {${options.declared??bytes.length}}\r\n`);if(options.declared===undefined){socket.write(bytes);socket.write(')\r\na4 OK done\r\n');}};if(options.phaseDelayMs)setTimeout(()=>{if(!socket.destroyed)send();},options.phaseDelayMs);else send();
   }else socket.destroy();
  }});
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;
 const fixture={ca:cert.cert.toString(),address:'127.0.0.1',smtp465:port,smtp587:port,imap993:port};
 const connector:TransportFixture={ca:cert.cert,resolver:async()=>[{address:'8.8.8.8',family:4}],dial:()=>({address:'127.0.0.1',port})};
 return {behavior:options,fixture,connector,commands,sockets,wire,get bodyPeak(){return bodyPeak;},get peak(){return peak;},async close(){for(const s of sockets)s.destroy();await new Promise<void>(r=>server.close(()=>r()));}};
}
