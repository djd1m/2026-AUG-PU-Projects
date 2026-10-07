import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
export async function runtimeFixture(count=5){
 const config=loadConfig(),pool=createPool(config.databaseUrl);
 const evidenceDir=process.env.F10_EVIDENCE_DIR,fixtureRun=evidenceDir?randomUUID():undefined;
 let currentPhase:'assert_owned'|'migrate'|'truncate_tenant'|'reconcile_reset'='assert_owned';
 const checkpoint=async(event:'begin'|'complete'|'failed',error?:unknown)=>{
  if(!evidenceDir)return;
  const safe=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_]{1,64}$/.test(value)?value:null;
  const failure=error as {name?:unknown;code?:unknown}|null|undefined;
  await appendFile(`${evidenceDir}/runtime-fixture-reset.jsonl`,JSON.stringify({fixtureRun,count,pid:process.pid,phase:currentPhase,event,utc:new Date().toISOString(),monotonicMs:performance.now(),...(event==='failed'?{errorName:safe(failure?.name),errorCode:safe(failure?.code)}:{})})+'\n');
 };
 try{
  await checkpoint('begin');await assertOwnedFixtureDatabase(pool);await checkpoint('complete');
  currentPhase='migrate';await checkpoint('begin');await migrate(pool);await checkpoint('complete');
  currentPhase='truncate_tenant';await checkpoint('begin');await pool.query('TRUNCATE tenant CASCADE');await checkpoint('complete');
  currentPhase='reconcile_reset';await checkpoint('begin');await pool.query('UPDATE runtime_reconcile SET after_created_at=NULL,after_mailbox=NULL WHERE id=1');await checkpoint('complete');
 }catch(error){
  // An absent failed entry makes the journal incomplete; journal IO never replaces the original error.
  try{await checkpoint('failed',error);}catch{}
  throw error;
 }
 await pool.query("INSERT INTO transport_operation(protocol,slot,header_reserved) VALUES('smtp',1,false),('smtp',2,false),('imap',1,false),('imap',2,false),('imap',3,false),('imap',4,true) ON CONFLICT DO NOTHING");
 const tenant=randomUUID(),boxes:string[]=[];await pool.query('INSERT INTO tenant(id) VALUES($1)',[tenant]);
 for(let i=0;i<count;i++){
  const id=randomUUID();boxes.push(id);
  await pool.query("INSERT INTO mailbox(id,tenant_id,label,state,credential_envelope) VALUES($1,$2,$3,'verified_test','{}')",[id,tenant,'runtime fixture '+i]);
  await pool.query("INSERT INTO capacity_lease(id,tenant_id,mailbox_id,state,expires_at) VALUES($1,$2,$1,'active',clock_timestamp()+interval '120 seconds')",[id,tenant]);
 }
 return {config,pool,tenant,boxes};
}
export async function poolRuntimeFixture(){
 const fixture=await runtimeFixture(0),{pool,config}=fixture;
 const {encryptCredentials}=await import('../src/mailboxes/crypto.js');
 const actors:{tenant:string;id:string}[]=[];
 const now=new Date();
 for(let i=0;i<3;i++){
  const tenant=randomUUID(),id=randomUUID(),account=randomUUID(),consent=randomUUID();
  await pool.query('INSERT INTO tenant(id) VALUES($1)',[tenant]);
  await pool.query("INSERT INTO account(id,tenant_id,email,password_hash) VALUES($1,$2,$3,'fixture')",[account,tenant,`${account}@example.test`]);
  const envelope=encryptCredentials({senderAddress:`f10-${i}@example.test`},tenant,id,config.credentialKeyring);
  await pool.query("INSERT INTO mailbox(id,tenant_id,label,state,credential_envelope) VALUES($1,$2,'pool runtime fixture','verified_test',$3)",[id,tenant,envelope]);
  await pool.query("INSERT INTO capacity_lease(id,tenant_id,mailbox_id,state,expires_at) VALUES($1,$2,$1,'active',$3::timestamptz+interval '120 seconds')",[id,tenant,now]);
  await pool.query("INSERT INTO mailbox_poll(mailbox_id,scan_complete,completed_at) VALUES($1,true,$2)",[id,now]);
  await pool.query("INSERT INTO consent(id,tenant_id,mailbox_id,actor_id,scope,scope_version,disclosure) VALUES($1,$2,$3,$4,'pool',1,'{}')",[consent,tenant,id,account]);
  await pool.query('INSERT INTO pool_member(tenant_id,mailbox_id,consent_id) VALUES($1,$2,$3)',[tenant,id,consent]);
  actors.push({tenant,id});
 }
 return {...fixture,actors,now};
}

export async function cadenceFixture(){
 const fixture=await runtimeFixture(0),{pool,config}=fixture;
 const {encryptCredentials}=await import('../src/mailboxes/crypto.js');
 const {transportInput}=await import('./f09-transport-fixture.js');
 const {publishTransportGrant,transportFingerprint}=await import('../src/mailboxes/transport-authority.js');
 const {readFile}=await import('node:fs/promises');
 const token=(await readFile(process.env.OPERATOR_TOKEN_FILE!,'utf8')).trim();
 const actors:{tenant:string;account:string}[]=[],boxes:string[]=[],active:string[]=[];
 for(let t=0;t<3;t++){const tenant=randomUUID(),account=randomUUID();await pool.query('INSERT INTO tenant(id) VALUES($1)',[tenant]);await pool.query("INSERT INTO account(id,tenant_id,email,password_hash) VALUES($1,$2,$3,'fixture')",[account,tenant,account+'@example.test']);actors.push({tenant,account});}
 for(let i=0;i<100;i++){
  const actor=actors[i%3]!,id=randomUUID(),consent=randomUUID(),input={...transportInput,senderAddress:`f10-${i}@example.test`};boxes.push(id);
  await pool.query("INSERT INTO mailbox(id,tenant_id,label,state,credential_envelope,metadata) VALUES($1,$2,'cadence fixture','verified_test',$3,$4)",[id,actor.tenant,encryptCredentials(input,actor.tenant,id,config.credentialKeyring),{smtpHost:input.smtpHost,smtpPort:465,imapHost:input.imapHost,imapPort:993}]);
  await pool.query("INSERT INTO consent(id,tenant_id,mailbox_id,actor_id,scope,scope_version,disclosure) VALUES($1,$2,$3,$4,'pool',1,'{}')",[consent,actor.tenant,id,actor.account]);await pool.query('INSERT INTO pool_member(tenant_id,mailbox_id,consent_id) VALUES($1,$2,$3)',[actor.tenant,id,consent]);
  if(i<30){active.push(id);await pool.query("INSERT INTO capacity_lease(id,tenant_id,mailbox_id,state,expires_at) VALUES($1,$2,$1,'active',clock_timestamp()+interval '120 seconds')",[id,actor.tenant]);
   await publishTransportGrant(pool,config,token,actor.tenant,id,'0',{scope:'transport',tenant:actor.tenant,mailbox:id,capabilities:['smtp_submit','imap_headers'],smtpHost:input.smtpHost,smtpPort:465,imapHost:input.imapHost,imapPort:993,mailboxTransportRevision:'0',configFingerprint:transportFingerprint(config.providerAllowlist),expiresAt:new Date(Date.now()+1200000).toISOString()});
  }
 }
 return {...fixture,actors,boxes,active};
}

// Real TLS fixture: only successful long-rescan FETCH pages consume five seconds.
export async function adversarialFixture(){
 const c=await runtimeFixture(0),{pool,config,tenant}=c;
 const {encryptCredentials}=await import('../src/mailboxes/crypto.js'),{transportInput,transportFixture}=await import('./f09-transport-fixture.js');
 const {publishTransportGrant,transportFingerprint}=await import('../src/mailboxes/transport-authority.js');
 const {readFile}=await import('node:fs/promises'),{createServer}=await import('node:tls');
 const token=(await readFile(process.env.OPERATOR_TOKEN_FILE!,'utf8')).trim(),base=await transportFixture(),boxes:string[]=[];
 const {ReplyStore}=await import('../src/replies/store.js'),operator=new ReplyStore(pool,config.credentialKeyring);
 for(const label of ['A','B','C','D','E']){
  const id=randomUUID(),input={...transportInput,senderAddress:label+'@example.test',imapUsername:label};boxes.push(id);
  await pool.query("INSERT INTO mailbox(id,tenant_id,label,state,credential_envelope,metadata) VALUES($1,$2,$3,'verified_test',$4,$5)",[id,tenant,label,encryptCredentials(input,tenant,id,config.credentialKeyring),{smtpHost:input.smtpHost,smtpPort:465,imapHost:input.imapHost,imapPort:993}]);
  if(label!=='E')await pool.query("INSERT INTO capacity_lease(id,tenant_id,mailbox_id,state,expires_at) VALUES($1,$2,$1,'active',clock_timestamp()+interval '120 seconds')",[id,tenant]);
  await publishTransportGrant(pool,config,token,tenant,id,'0',{scope:'transport',tenant,mailbox:id,capabilities:['imap_headers'],smtpHost:input.smtpHost,smtpPort:465,imapHost:input.imapHost,imapPort:993,mailboxTransportRevision:'0',configFingerprint:transportFingerprint(config.providerAllowlist),expiresAt:new Date(Date.now()+600000).toISOString()});

 }
 const sockets=new Set<import('node:tls').TLSSocket>(),traffic:unknown[]=[],timers=new Set<NodeJS.Timeout>(),wire:unknown[]=[];let maxSockets=0,socketSequence=0;
 const server=createServer(base.cert,socket=>{
  const connection=++socketSequence;let label='';const record=(phase:string,verb?:string)=>wire.push({connection,label:['A','B','C','D','E'].includes(label)?label:null,mailbox:boxes[['A','B','C','D','E'].indexOf(label)]??null,phase,verb,utc:new Date().toISOString(),monotonicMs:performance.now()});record('socket_open');
  sockets.add(socket);maxSockets=Math.max(maxSockets,sockets.size);let pending='',auth=false;socket.on('error',()=>record('socket_error'));socket.once('end',()=>record('socket_end'));socket.once('close',()=>{record('socket_close');sockets.delete(socket);});socket.write('* OK fixture\r\n');record('response_written','GREETING');
  socket.on('data',chunk=>{pending+=chunk.toString();for(;;){const end=pending.indexOf('\r\n');if(end<0)break;const line=pending.slice(0,end);pending=pending.slice(end+2);
   if(auth){auth=false;label=Buffer.from(line,'base64').toString().split('\0')[1]!;socket.write('a2 OK authenticated\r\n');record('response_written','AUTHENTICATE');continue;}
   const verb=line==='a1 CAPABILITY'?'CAPABILITY':line==='a2 AUTHENTICATE PLAIN'?'AUTHENTICATE':line==='a3 EXAMINE INBOX'?'EXAMINE':line.startsWith('a4 UID FETCH ')?'FETCH':'UNKNOWN';record('command_received',verb);
   if(line==='a1 CAPABILITY')socket.write('* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\na1 OK done\r\n');
   else if(line==='a2 AUTHENTICATE PLAIN'){auth=true;socket.write('+ challenge\r\n');record('challenge_written','AUTHENTICATE');}
   else if(line==='a3 EXAMINE INBOX')socket.write(`* 1 EXISTS\r\n* OK [UIDVALIDITY 1] generation\r\n* OK [UIDNEXT ${label==='E'?1:3001}] next\r\na3 OK [READ-ONLY] examined\r\n`);
   else if(line.startsWith('a4 UID FETCH ')){const started=Date.now(),mailbox=boxes[['A','B','C','D','E'].indexOf(label)]!;void pool.query("SELECT service_seq,owner_id,state,due_at FROM runtime_due WHERE mailbox_id=$1 AND kind='poll'",[mailbox]).then(r=>traffic.push({label,mailbox,started,beforeIO:r.rows[0]}));const monotonicStarted=performance.now(),duration=label==='E'?0:5000;const finish=()=>{const elapsedMs=performance.now()-monotonicStarted;if(elapsedMs<duration){const wait=setTimeout(()=>{timers.delete(wait);finish();},Math.ceil(duration-elapsedMs));timers.add(wait);return;}traffic.push({label,mailbox,started,completed:Date.now(),elapsedMs,command:line});if(!socket.destroyed){socket.write('a4 OK complete\r\n');record('response_written','FETCH');}else record('response_suppressed_closed_socket','FETCH');};const timer=setTimeout(()=>{timers.delete(timer);finish();},duration);timers.add(timer);}
   else {record('server_destroy');socket.destroy();}
   if(verb!=='FETCH'&&verb!=='UNKNOWN'&&verb!=='AUTHENTICATE')record('response_written',verb);
  }});
 });await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const options={...base.options!,imap993:(server.address() as {port:number}).port};
 const {LiveReplyAdapter}=await import('../src/replies/adapter.js'),{PollWorker}=await import('../src/replies/worker.js'),adapter=new LiveReplyAdapter(pool,{...config,pollMode:'live_provider'},options),worker=new PollWorker(pool,config.credentialKeyring,'live_provider',adapter);
 await Promise.all(boxes.slice(0,4).map(async id=>{await operator.capture(tenant,id,await adapter.snapshot(tenant,id));const page=await worker.quantum(tenant,id,async()=>{},new AbortController().signal);assert.equal(page.state,'scanning','native priming page succeeds');}));
 const primed=(await pool.query('SELECT mailbox_id,cursor_uid,pages,state,high_water FROM reply_rescan ORDER BY mailbox_id')).rows;
 await pool.query("INSERT INTO capacity_lease(id,tenant_id,mailbox_id,state,expires_at) VALUES($1,$2,$1,'active',clock_timestamp()+interval '120 seconds')",[boxes[4],tenant]);
 const {RuntimeStore}=await import('../src/runtime/store.js');await new RuntimeStore(pool).maintenance();
 await pool.query("UPDATE runtime_due SET due_at=clock_timestamp()-CASE WHEN mailbox_id=$1 THEN interval '1 minute' ELSE interval '2 minutes' END,next_check_at=clock_timestamp() WHERE kind='poll'",[boxes[4]]);
 const eligibility={at:new Date().toISOString(),monotonicMs:performance.now(),primed,rows:(await pool.query("SELECT mailbox_id,due_at,next_check_at,service_seq,state FROM runtime_due WHERE kind='poll'")).rows};
 return {...c,boxes,eligibility,options,traffic,wire,sockets,get maxSockets(){return maxSockets;},async close(){for(const t of timers)clearTimeout(t);for(const s of sockets)s.destroy();await new Promise<void>(r=>server.close(()=>r()));await base.close();await pool.end();}};
}

async function assertOwnedFixtureDatabase(pool:import('pg').Pool){
 const row=(await pool.query("SELECT current_database() AS name,current_user AS role,(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner")).rows[0];
 if(process.env.DATABASE_NAME==='n7f11_a8'){
  const {readFile}=await import('node:fs/promises'),lease=JSON.parse(await readFile(process.env.N7_DB_OWNERSHIP_LEASE!,'utf8'));
  assert.equal(row.name,'n7f11_a8');assert.equal(lease.database,row.name);assert.equal(row.role,lease.owner_role);assert.equal(row.owner,lease.owner_role);
  if((await pool.query("SELECT to_regclass('public.transport_operation') AS present")).rows[0].present)assert.equal((await pool.query('SELECT count(*) AS n FROM transport_operation WHERE operation IS NOT NULL')).rows[0].n,'0','owned fixture reset waits for exact physical joins');
 }else assert.equal(row.name,'n7f10_a2','legacy fixture namespace remains unchanged');
}
