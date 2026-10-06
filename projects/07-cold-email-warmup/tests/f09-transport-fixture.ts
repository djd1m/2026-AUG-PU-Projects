import assert from 'node:assert/strict';
import { createServer as tlsServer,TLSSocket } from 'node:tls';
import { createServer as netServer,type Socket,type Server } from 'node:net';
import { certificates,diagnosticInput } from './diagnostics-fixture.js';
import type { TransportFixture } from '../src/mailboxes/transport-channel.js';
import type { ChildRequest } from '../src/mailboxes/transport-lifetime.js';
export const transportInput=diagnosticInput;
export const transportAllowlist=new Map([['smtp.gmail.com',30],['imap.gmail.com',30]]);
export interface TransportBehavior {finalCode?:number;disconnectAfterData?:boolean;uidvalidity?:string;uidNext?:number;headers?:{uid:number;text:string}[];wrongTag?:boolean;stall?:boolean;oversizeLiteral?:boolean}
export async function transportFixture(behavior:TransportBehavior={}){
 const cert=certificates(),sockets=new Set<Socket>(),servers:Server[]=[],verbs:string[]=[];let connections=0,maxConnections=0;
 const watch=(socket:Socket)=>{sockets.add(socket);connections++;maxConnections=Math.max(maxConnections,connections);socket.on('error',()=>{});socket.on('close',()=>{sockets.delete(socket);connections--;});};
 const speak=(socket:Socket,protocol:'smtp'|'imap',starttls=false,greet=true)=>{
  watch(socket);if(behavior.stall)return;if(greet)socket.write(protocol==='smtp'?'220 fixture\r\n':'* OK fixture\r\n');let pending='',authenticating=false,body=false;
  socket.on('data',(chunk:Buffer)=>{pending+=chunk.toString();for(;;){const end=pending.indexOf('\r\n');if(end<0)break;const line=pending.slice(0,end);pending=pending.slice(end+2);
   if(body){if(line==='.'){body=false;if(behavior.disconnectAfterData)socket.destroy();else socket.write((behavior.finalCode??250)+' SECRET_PEER_CANARY\r\n');}continue;}
   if(authenticating){authenticating=false;verbs.push('AUTH_RESPONSE');socket.write('a2 OK authenticated\r\n');continue;}
   const verb=line.split(' ')[protocol==='smtp'?0:1]!;verbs.push(verb);
   if(protocol==='smtp'){
    if(line.startsWith('EHLO '))socket.write(starttls?'250-fixture\r\n250 STARTTLS\r\n':'250-fixture\r\n250 AUTH PLAIN\r\n');
    else if(line==='STARTTLS'){socket.removeAllListeners('data');socket.write('220 upgrade\r\n',()=>speak(new TLSSocket(socket,{isServer:true,...cert}),'smtp',false,false));return;}
    else if(line.startsWith('AUTH PLAIN '))socket.write('235 authenticated\r\n');
    else if(line.startsWith('MAIL FROM:')||line.startsWith('RCPT TO:'))socket.write('250 envelope\r\n');
    else if(line==='DATA'){body=true;socket.write('354 body\r\n');}else socket.destroy();
   }else{
    if(line==='a1 CAPABILITY')socket.write('* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\na1 OK done\r\n');
    else if(line==='a2 AUTHENTICATE PLAIN'){authenticating=true;socket.write('+ challenge\r\n');}
    else if(line==='a3 EXAMINE INBOX')socket.write(`* 1 EXISTS\r\n* OK [UIDVALIDITY ${behavior.uidvalidity??'1'}] generation\r\n* OK [UIDNEXT ${behavior.uidNext??2}] next\r\na3 OK [READ-ONLY] examined\r\n`);
    else if(/^a4 UID FETCH \d+:\d+ \(UID BODY.PEEK\[HEADER.FIELDS \(FROM MESSAGE-ID IN-REPLY-TO REFERENCES\)\]\)$/.test(line)){
     const range=/FETCH (\d+):(\d+)/.exec(line)!,lo=Number(range[1]),hi=Number(range[2]);
     for(const header of behavior.headers??[]){if(header.uid<lo||header.uid>hi)continue;const literal=Buffer.from(header.text);socket.write(`* 1 FETCH (UID ${header.uid} BODY[HEADER.FIELDS (FROM MESSAGE-ID IN-REPLY-TO REFERENCES)] {${behavior.oversizeLiteral?8193:literal.length}}\r\n`);socket.write(literal);socket.write(')\r\n');}
     socket.write((behavior.wrongTag?'wrong':'a4')+' OK complete\r\n');
    }else socket.destroy();
   }
  }});
 };
 const smtp=tlsServer(cert,s=>speak(s,'smtp')),plain=netServer(s=>speak(s,'smtp',true)),imap=tlsServer(cert,s=>speak(s,'imap'));
 for(const server of [smtp,plain,imap]){servers.push(server);server.on('error',()=>{});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));}
 const port=(s:Server)=>(s.address() as {port:number}).port;
 const options:ChildRequest['fixture']={ca:cert.cert.toString(),address:'127.0.0.1',smtp465:port(smtp),smtp587:port(plain),imap993:port(imap)};
 const connector:TransportFixture={ca:cert.cert,resolver:async()=>[{address:'8.8.8.8',family:4}],dial:(_address,p)=>({address:'127.0.0.1',port:p===465?port(smtp):p===587?port(plain):port(imap)})};
 return {options,connector,verbs,sockets,cert,get maxConnections(){return maxConnections;},async close(){for(const socket of sockets)socket.destroy();await Promise.all(servers.map(s=>new Promise<void>(r=>s.close(()=>r()))));}};
}
export async function recoveryScenario(){
 const {readFile}=await import('node:fs/promises'),{randomUUID}=await import('node:crypto');
 const {loadConfig}=await import('../src/config.js'),{createPool,migrate}=await import('../src/db.js'),{application}=await import('../src/server.js'),{seedCapacity}=await import('./capacity-fixture.js');
 const {publishTransportGrant,transportFingerprint}=await import('../src/mailboxes/transport-authority.js'),{SubmissionStore}=await import('../src/dispatch/submission.js'),{DispatchSeams}=await import('../src/dispatch/seams.js'),{LiveReplyAdapter}=await import('../src/replies/adapter.js'),{PollWorker,identity}=await import('../src/replies/worker.js');
 const config={...loadConfig(),dispatchMode:'live_provider' as const,pollMode:'live_provider' as const},pool=createPool(config.databaseUrl),behavior:TransportBehavior={disconnectAfterData:true,uidNext:2,headers:[]},fixture=await transportFixture(behavior);
 try{
  assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'n7f09_a1');await migrate(pool);await pool.query('TRUNCATE tenant,auth_bucket CASCADE');await pool.query("INSERT INTO transport_operation(protocol,slot) VALUES('smtp',1),('smtp',2),('imap',1),('imap',2),('imap',3),('imap',4) ON CONFLICT DO NOTHING");const app=await application(config,pool,{resolver:async()=>[{address:'8.8.8.8',family:4}]});
  const tenant=randomUUID(),account=randomUUID();await pool.query('INSERT INTO tenant(id) VALUES($1)',[tenant]);await pool.query('INSERT INTO account(id,tenant_id,email,password_hash) VALUES($1,$2,$3,$4)',[account,tenant,'f09@example.com','not-login']);
  const actor={tenant_id:tenant,account_id:account},mailbox=(await app.mailboxes.save(tenant,{...transportInput,senderAddress:'a@example.com'})).id;
  await pool.query("UPDATE mailbox SET state='verified_test' WHERE id=$1",[mailbox]);await seedCapacity(pool,new Date());
  const token=(await readFile(process.env.OPERATOR_TOKEN_FILE!,'utf8')).trim();
  await publishTransportGrant(pool,config,token,tenant,mailbox,'0',{scope:'transport',tenant,mailbox,capabilities:['smtp_submit','imap_headers'],smtpHost:'smtp.gmail.com',smtpPort:465,imapHost:'imap.gmail.com',imapPort:993,mailboxTransportRevision:'0',configFingerprint:transportFingerprint(config.providerAllowlist),expiresAt:new Date(Date.now()+600000).toISOString()});
  await new DispatchSeams(pool).recordPoll(tenant,mailbox,{completedAt:new Date(),scanComplete:true,uidvalidity:'1',cursorUid:0});
  const campaign=await app.consents.campaign(actor,{steps:[{subject:'Hello',body:'Body',delayHours:24},{subject:'Follow',body:'Follow body',delayHours:24}],recipients:[{address:'b@example.com',fields:{}}]});
  await app.consents.act(actor,mailbox,{scope:'campaign',action:'grant',affirmative:true,scopeVersion:campaign.content_version,campaignId:campaign.id,recipientFingerprint:campaign.recipient_fingerprint});await app.campaigns.start(actor,campaign.id,{mailboxIds:[mailbox]},new Date());const job=await app.dispatch.claim();assert.ok(job);
  const submit=new SubmissionStore(pool,config,{transportFixture:fixture.options});assert.equal((await submit.submit(job.id,job.lease_owner)).state,'unknown_delivery');
  const sent=(await pool.query('SELECT * FROM send_job WHERE id=$1',[job.id])).rows[0];assert.ok(sent.reserved_day);assert.equal(sent.attempt_count,1);assert.equal(sent.transport_mode,'protocol_fixture');assert.equal((await pool.query('SELECT count(*) FROM local_test_message')).rows[0].count,'0');assert.equal((await submit.submit(job.id,job.lease_owner)).calls,0);assert.equal(fixture.verbs.filter(v=>v==='DATA').length,1);
  behavior.headers=[{uid:1,text:`From: b@example.com\r\nMessage-ID: <reused@example.com>\r\nReferences: ${sent.message_id}\r\n\r\n`}];const worker=new PollWorker(pool,config.credentialKeyring,'live_provider',new LiveReplyAdapter(pool,config,fixture.options));assert.equal((await worker.poll(tenant,mailbox)).state,'complete');assert.equal((await pool.query('SELECT count(*) FROM reply_effect')).rows[0].count,'1');
  behavior.uidvalidity='2';behavior.wrongTag=true;assert.equal((await worker.poll(tenant,mailbox)).state,'paused');assert.equal((await pool.query('SELECT scan_complete FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0].scan_complete,false);assert.equal((await pool.query("SELECT count(*) FROM reply_observation WHERE uidvalidity='2'")).rows[0].count,'0');
  behavior.wrongTag=false;const run=await worker.store.status(tenant,mailbox);assert.ok(run);await worker.store.retry(tenant,mailbox,identity(run));assert.equal((await worker.poll(tenant,mailbox)).state,'complete');assert.equal((await pool.query('SELECT count(*) FROM reply_effect')).rows[0].count,'1');assert.equal((await pool.query('SELECT count(*) FROM reply_observation')).rows[0].count,'2');assert.equal((await pool.query('SELECT state FROM send_job WHERE id=$1',[job.id])).rows[0].state,'unknown');assert.equal(fixture.verbs.filter(v=>v==='DATA').length,1);assert.equal((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
 }finally{await fixture.close();await pool.end();}
}
