import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { createServer as tlsServer,TLSSocket } from 'node:tls';
import { createServer as netServer,type Socket,type Server } from 'node:net';
import { certificates,diagnosticInput } from './diagnostics-fixture.js';
import type { TransportFixture } from '../src/mailboxes/transport-channel.js';
import type { ChildRequest } from '../src/mailboxes/transport-lifetime.js';
export const transportInput=diagnosticInput;
export const transportAllowlist=new Map([['smtp.gmail.com',30],['imap.gmail.com',30]]);
export interface TransportBehavior {imapDelayMs?:()=>number;slowEhlo?:boolean;slowAuthChallenge?:boolean;controlBytes?:number;mailCode?:number;rcptCode?:number;authCode?:number;greetingCode?:number;partialFinal?:boolean;closeAfterFinal?:boolean;fragmentBytes?:number;rev2?:boolean;fetchSuffix?:string;fetchPrefix?:string;taggedFailure?:string;examineFailure?:boolean;onData?:()=>void;finalCode?:number;disconnectAfterData?:boolean;uidvalidity?:string;uidNext?:number;headers?:{uid:number;text:string}[];wrongTag?:boolean;stall?:boolean;oversizeLiteral?:boolean}
export async function transportFixture(behavior:TransportBehavior={}){
 const peerLatencies:{protocol:string;openedAt:number;closedAt:number;elapsedMs:number}[]=[];const cert=certificates(),sockets=new Set<Socket>(),servers:Server[]=[],verbs:string[]=[];let connections=0,maxConnections=0;const timers=new Set<NodeJS.Timeout>();const later=(milliseconds:number,call:()=>void)=>{const timer=setTimeout(()=>{timers.delete(timer);call();},milliseconds);timers.add(timer);};
 const watch=(socket:Socket)=>{sockets.add(socket);connections++;maxConnections=Math.max(maxConnections,connections);socket.on('error',()=>{});socket.on('close',()=>{sockets.delete(socket);connections--;});};
 const speak=(socket:Socket,protocol:'smtp'|'imap',starttls=false,greet=true)=>{
  watch(socket);const openedAt=Date.now(),monotonic=performance.now();socket.once('close',()=>peerLatencies.push({protocol,openedAt,closedAt:Date.now(),elapsedMs:performance.now()-monotonic}));if(behavior.stall)return;if(greet)socket.write(protocol==='smtp'?(behavior.greetingCode??220)+' '+(behavior.controlBytes?'A'.repeat(behavior.controlBytes):'fixture')+'\r\n':'* OK fixture\r\n');let pending='',authenticating=false,body=false;
  socket.on('data',(chunk:Buffer)=>{const handle=()=>{pending+=chunk.toString();for(;;){const end=pending.indexOf('\r\n');if(end<0)break;const line=pending.slice(0,end);pending=pending.slice(end+2);
   if(body){if(line==='.'){body=false;behavior.onData?.();if(behavior.disconnectAfterData)socket.destroy();else if(behavior.partialFinal)socket.end('250 incomplete');else{socket.write((behavior.finalCode??250)+' SECRET_PEER_CANARY\r\n');if(behavior.closeAfterFinal)setTimeout(()=>socket.destroy(),10);}}continue;}
   if(authenticating){authenticating=false;verbs.push('AUTH_RESPONSE');if(protocol==='smtp')later(6000,()=>{if(!socket.destroyed)socket.write('235 authenticated\r\n');});else socket.write('a2 OK authenticated\r\n');continue;}
   const verb=line.split(' ')[protocol==='smtp'?0:1]!;verbs.push(verb);
   if(protocol==='smtp'){
    if(line.startsWith('EHLO ')){if(behavior.slowEhlo){later(6000,()=>{if(!socket.destroyed)socket.write('250-fixture\r\n');});later(12000,()=>{if(!socket.destroyed)socket.write(starttls?'250 STARTTLS\r\n':'250 AUTH PLAIN\r\n');});}else socket.write(starttls?'250-fixture\r\n250 STARTTLS\r\n':'250-fixture\r\n250 AUTH PLAIN\r\n');}
    else if(line==='STARTTLS'){socket.removeAllListeners('data');socket.write('220 upgrade\r\n',()=>speak(new TLSSocket(socket,{isServer:true,...cert}),'smtp',false,false));return;}
    else if(line.startsWith('AUTH PLAIN ')){if(behavior.slowAuthChallenge){authenticating=true;later(6000,()=>{if(!socket.destroyed)socket.write('334 challenge\r\n');});}else socket.write((behavior.authCode??235)+' authenticated\r\n');}
    else if(line.startsWith('MAIL FROM:'))socket.write((behavior.mailCode??250)+' envelope\r\n');else if(line.startsWith('RCPT TO:'))socket.write((behavior.rcptCode??250)+' envelope\r\n');
    else if(line==='DATA'){body=true;socket.write('354 body\r\n');}else socket.destroy();
   }else{
    if(line==='a1 CAPABILITY')socket.write('* CAPABILITY '+(behavior.rev2?'IMAP4rev2':'IMAP4rev1')+' AUTH=PLAIN\r\na1 OK done\r\n');
    else if(line==='a2 AUTHENTICATE PLAIN'){authenticating=true;socket.write('+ challenge\r\n');}
    else if(line==='a3 EXAMINE INBOX')socket.write(`* 1 EXISTS\r\n* OK [UIDVALIDITY ${behavior.uidvalidity??'1'}] generation\r\n* OK [UIDNEXT ${behavior.uidNext??2}] next\r\na3 ${behavior.examineFailure?'NO':'OK'} [READ-ONLY] examined\r\n`);
    else if(/^a4 UID FETCH \d+:\d+ \(UID BODY.PEEK\[HEADER.FIELDS \(FROM MESSAGE-ID IN-REPLY-TO REFERENCES\)\]\)$/.test(line)){
     const range=/FETCH (\d+):(\d+)/.exec(line)!,lo=Number(range[1]),hi=Number(range[2]);
     for(const header of behavior.headers??[]){if(header.uid<lo||header.uid>hi)continue;const literal=Buffer.from(header.text);socket.write(behavior.fetchPrefix??`* 1 FETCH (UID ${header.uid} BODY[HEADER.FIELDS (FROM MESSAGE-ID IN-REPLY-TO REFERENCES)] {${behavior.oversizeLiteral?8193:literal.length}}\r\n`);if(behavior.fragmentBytes){for(let offset=0;offset<literal.length;offset+=behavior.fragmentBytes)socket.write(literal.subarray(offset,offset+behavior.fragmentBytes));}else socket.write(literal);socket.write((behavior.fetchSuffix??')')+'\r\n');}
     socket.write((behavior.wrongTag?'wrong':'a4')+' '+(behavior.taggedFailure??'OK')+' complete\r\n');
    }else socket.destroy();
   }
  }};const milliseconds=protocol==='imap'?(behavior.imapDelayMs?.()??0):0;if(milliseconds)later(milliseconds,handle);else handle();});
 };
 const smtp=tlsServer(cert,s=>speak(s,'smtp')),plain=netServer(s=>speak(s,'smtp',true)),imap=tlsServer(cert,s=>speak(s,'imap'));
 for(const server of [smtp,plain,imap]){servers.push(server);server.on('error',()=>{});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));}
 const port=(s:Server)=>(s.address() as {port:number}).port;
 const options:ChildRequest['fixture']={ca:cert.cert.toString(),address:'127.0.0.1',smtp465:port(smtp),smtp587:port(plain),imap993:port(imap)};
 const connector:TransportFixture={ca:cert.cert,resolver:async()=>[{address:'8.8.8.8',family:4}],dial:(_address,p)=>({address:'127.0.0.1',port:p===465?port(smtp):p===587?port(plain):port(imap)})};
 return {options,connector,verbs,sockets,cert,peerLatencies,get maxConnections(){return maxConnections;},async close(){for(const timer of timers)clearTimeout(timer);timers.clear();for(const socket of sockets)socket.destroy();await Promise.all(servers.map(s=>new Promise<void>(r=>s.close(()=>r()))));}};
}
export async function recoveryScenario(){
 const {readFile}=await import('node:fs/promises'),{randomUUID}=await import('node:crypto');
 const {loadConfig}=await import('../src/config.js'),{createPool,migrate}=await import('../src/db.js'),{application}=await import('../src/server.js'),{seedCapacity}=await import('./capacity-fixture.js');
 const {publishTransportGrant,transportFingerprint}=await import('../src/mailboxes/transport-authority.js'),{SubmissionStore}=await import('../src/dispatch/submission.js'),{DispatchSeams}=await import('../src/dispatch/seams.js'),{LiveReplyAdapter}=await import('../src/replies/adapter.js'),{PollWorker,identity}=await import('../src/replies/worker.js');
 const config={...loadConfig(),dispatchMode:'live_provider' as const,pollMode:'live_provider' as const},pool=createPool(config.databaseUrl),behavior:TransportBehavior={disconnectAfterData:true,uidNext:2,headers:[]},fixture=await transportFixture(behavior);
 try{
  assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'n7f10_a2');await migrate(pool);await pool.query('TRUNCATE tenant,auth_bucket CASCADE');await pool.query("INSERT INTO transport_operation(protocol,slot) VALUES('smtp',1),('smtp',2),('imap',1),('imap',2),('imap',3),('imap',4) ON CONFLICT DO NOTHING");const app=await application(config,pool,{resolver:async()=>[{address:'8.8.8.8',family:4}]});
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
export async function transportContext(scope:'campaign'|'pool'='campaign',grants=true){
 const {readFile}=await import('node:fs/promises'),{randomUUID}=await import('node:crypto');
 const {loadConfig}=await import('../src/config.js'),{createPool,migrate}=await import('../src/db.js'),{application}=await import('../src/server.js'),{seedCapacity}=await import('./capacity-fixture.js');
 const {publishTransportGrant,transportFingerprint}=await import('../src/mailboxes/transport-authority.js'),{DispatchSeams}=await import('../src/dispatch/seams.js');
 const config={...loadConfig(),dispatchMode:'live_provider' as const,pollMode:'live_provider' as const},pool=createPool(config.databaseUrl);assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'n7f10_a2');await migrate(pool);await pool.query('TRUNCATE tenant,auth_bucket CASCADE');await pool.query("INSERT INTO transport_operation(protocol,slot) VALUES('smtp',1),('smtp',2),('imap',1),('imap',2),('imap',3),('imap',4) ON CONFLICT DO NOTHING");
 const app=await application(config,pool,{resolver:async()=>[{address:'8.8.8.8',family:4}]}),actors:import('../src/auth/store.js').Identity[]=[],boxes:string[]=[];
 const token=(await readFile(process.env.OPERATOR_TOKEN_FILE!,'utf8')).trim();
 for(let i=0;i<2;i++){const tenant=randomUUID(),account=randomUUID();await pool.query('INSERT INTO tenant(id) VALUES($1)',[tenant]);await pool.query('INSERT INTO account(id,tenant_id,email,password_hash) VALUES($1,$2,$3,$4)',[account,tenant,`f09-${i}@example.com`,'not-login']);actors.push({tenant_id:tenant,account_id:account});boxes.push((await app.mailboxes.save(tenant,{...transportInput,senderAddress:i?'b@example.com':'a@example.com'})).id);await pool.query("UPDATE mailbox SET state='verified_test' WHERE id=$1",[boxes[i]]);}
 const publish=async(i:number,capabilities:import('../src/mailboxes/transport-authority.js').TransportCapability[]=['smtp_submit','imap_headers'],overrides:Record<string,unknown>={})=>{const tenant=actors[i]!.tenant_id,mailbox=boxes[i]!,m=(await pool.query('SELECT transport_revision,metadata FROM mailbox WHERE id=$1',[mailbox])).rows[0],revision=(await pool.query('SELECT revision FROM transport_grant WHERE mailbox_id=$1',[mailbox])).rows[0]?.revision??'0';return publishTransportGrant(pool,config,token,tenant,mailbox,revision,{scope:'transport',tenant,mailbox,capabilities,smtpHost:m.metadata.smtpHost,smtpPort:m.metadata.smtpPort,imapHost:m.metadata.imapHost,imapPort:m.metadata.imapPort,mailboxTransportRevision:m.transport_revision,configFingerprint:transportFingerprint(config.providerAllowlist),expiresAt:new Date(Date.now()+600000).toISOString(),...overrides});};
 if(grants){await publish(0);await publish(1);}const refresh=async(now=new Date())=>{await seedCapacity(pool,now);for(let i=0;i<2;i++)await new DispatchSeams(pool).recordPoll(actors[i]!.tenant_id,boxes[i]!,{completedAt:now,scanComplete:true,uidvalidity:'1',cursorUid:0});};await refresh();
 const campaign=await app.consents.campaign(actors[0]!,{steps:[{subject:'Hello',body:'Body',delayHours:24},{subject:'Follow',body:'Next',delayHours:24}],recipients:[{address:'b@example.com',fields:{}}]});
 for(let i=0;i<2;i++)await app.consents.act(actors[i]!,boxes[i]!,{scope:'pool',action:'grant',affirmative:true,scopeVersion:1});
 await app.consents.act(actors[0]!,boxes[0]!,{scope:'campaign',action:'grant',affirmative:true,scopeVersion:campaign.content_version,campaignId:campaign.id,recipientFingerprint:campaign.recipient_fingerprint});
 const day=(await pool.query("SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date::text AS day")).rows[0].day;
 if(scope==='campaign')await app.campaigns.start(actors[0]!,campaign.id,{mailboxIds:[boxes[0]]},new Date());else await pool.query("INSERT INTO send_job(id,tenant_id,mailbox_id,recipient_mailbox_id,scope,state,due_at,payload,pair_key) VALUES($1,$2,$3,$4,'pool','queued',clock_timestamp(),$5,$6)",[randomUUID(),actors[0]!.tenant_id,boxes[0],boxes[1],{subject:'Hello',body:'Body'},[...boxes].sort().join(':')+':'+day]);
 const claim=async(now?:Date)=>{const job=await app.dispatch.claim(randomUUID(),now);assert.ok(job);return job;};
 return {pool,config,app,actors,boxes,token,campaign,publish,refresh,claim,async close(){await pool.end();}};
}
