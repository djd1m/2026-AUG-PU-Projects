import { createHash } from 'node:crypto';
import type { ChildRequest } from '../src/mailboxes/transport-lifetime.js';
// Only this trusted test entrypoint accepts IPC fixtures; production CLI cannot.
process.once('message',(value:unknown)=>{const fixture=value as ChildRequest['fixture'];void (async()=>{
 const {loadConfig}=await import(new URL('../dist/config.js',import.meta.url).href),{createPool}=await import(new URL('../dist/db.js',import.meta.url).href);
 const config={...loadConfig(),dispatchMode:'live_provider' as const,pollMode:'live_provider' as const},pool=createPool(config.databaseUrl),abort=new AbortController();
 await installCaptureObserver(pool,config);
 const planned=process.env.F10_PLANNED_DRAIN==='1';
 const lifetime=planned?await import(new URL('../dist/mailboxes/transport-lifetime.js',import.meta.url).href):undefined;
 const stop=()=>{if(lifetime)abort.abort(lifetime.createProcessDrainReason());else abort.abort();};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
 try{const built=await import(new URL('../dist/runtime/worker.js',import.meta.url).href);process.send?.({started:true,execArgv:process.execArgv});await built.runWorker(pool,config,abort.signal,process.env.F10_FAIR_ONCE==='1',fixture);const {readFile}=await import('node:fs/promises');process.send?.({drained:true,stat:await readFile('/proc/self/stat','utf8')});}
 catch(error){
  const e=error as {name?:unknown;code?:unknown;message?:unknown;stack?:unknown},root=new URL('../',import.meta.url).pathname;
  const label=(v:unknown,fallback:string)=>typeof v==='string'&&/^[A-Za-z0-9_]{1,64}$/.test(v)?v:fallback;
  const frames=typeof e.stack==='string'?e.stack.split('\n').slice(1).flatMap(line=>{
   const location=line.match(/(?:file:\/\/)?(\/[^ ()]+):(\d+):(\d+)\)?$/),node=line.match(/(node:internal\/[a-zA-Z0-9_/-]{1,160}):(\d+):(\d+)\)?$/);
   const relative=location?.[1]?.startsWith(root)?location[1].slice(root.length):null;
   return relative&&/^(?:src|dist)\/[a-zA-Z0-9_/-]{1,160}\.[cm]?[jt]s$/.test(relative)?[{file:relative,line:Number(location![2]),column:Number(location![3])}]:node?[{file:node[1],line:Number(node[2]),column:Number(node[3])}]:[];
  }).slice(0,6):[];
  process.send?.({failed:true,code:label(e.code,'runtime_failure'),name:label(e.name,'Error'),messageSha256:createHash('sha256').update(typeof e.message==='string'?e.message:'non_error_throw').digest('hex'),frames,utc:new Date().toISOString(),monotonicNs:process.hrtime.bigint().toString()});process.exitCode=1;}finally{await pool.end();process.disconnect?.();}
 })();});


// Instrument the existing compiled worker's checked-out client, never its decisions.
async function installCaptureObserver(pool:import('pg').Pool,config:import('../src/config.js').Config){
 const {readFile}=await import('node:fs/promises');
 const startTicks=(await readFile('/proc/self/stat','utf8')).split(') ')[1]!.split(' ')[19]!;
 const ts=await import('typescript');
 const {transportFingerprint}=await import(new URL('../dist/mailboxes/transport-authority.js',import.meta.url).href);
 const expectedConfigFingerprint=transportFingerprint(config.providerAllowlist);
 const sources=await Promise.all(['replies/context-store','runtime/store','mailboxes/transport-authority','mailboxes/transport-slots'].map(async name=>({name,sql:await readFile(new URL('../src/'+name+'.ts',import.meta.url),'utf8')})));
 const astBindings=sources.flatMap(source=>{const tree=ts.createSourceFile(source.name,source.sql,ts.ScriptTarget.Latest,true),bindings:{sql:string;astSha256:string}[]=[];const visit=(node:import('typescript').Node)=>{if(ts.isNoSubstitutionTemplateLiteral(node)||ts.isStringLiteral(node))bindings.push({sql:node.text,astSha256:createHash('sha256').update(node.getText(tree)).digest('hex')});ts.forEachChild(node,visit);};visit(tree);return bindings;});
 const hash=(v:string)=>createHash('sha256').update(v).digest('hex');let emitted=0,sequence=0;
 const emit=(record:Record<string,unknown>)=>{if(emitted++<16000)process.send?.({captureObservation:{...record,pid:process.pid,startTicks,sequence:++sequence,utc:new Date().toISOString(),monotonicNs:process.hrtime.bigint().toString()}});else if(emitted===16001)process.send?.({captureObservationGap:'record_limit'});};
 pool.on('connect',client=>{
  const original=client.query.bind(client);
  const query=original as unknown as (sql:string,values?:unknown[])=>Promise<import('pg').QueryResult>;
  let locked=false,context:Record<string,unknown>|null=null,last:string|null=null,branch:string|null=null;
  const stage=(sql:string)=>sql.startsWith('SELECT 1 FROM incoming_ai_event WHERE window_end>')?'pending_continuation':sql.startsWith('SELECT count(*) AS n FROM incoming_ai_event WHERE window_end>')?'live_windows':sql.startsWith('SELECT e.*,p.completed_at')?'eligible_frontier':sql.startsWith('SELECT m.transport_revision,m.credential_envelope')?'transport_authority':sql.startsWith('SELECT 1 FROM mailbox_poll WHERE mailbox_id=$1 AND NOT scan_complete')?'body_header_due':sql.startsWith("SELECT count(*) AS n FROM transport_operation WHERE protocol='imap'")?'potential_body_occupancy':sql.startsWith('SELECT 1 FROM transport_operation WHERE protocol=$1 AND mailbox_id=$2')?'mailbox_occupied':sql.startsWith('SELECT slot FROM transport_operation WHERE protocol=$1')?'free_slot':null;
  client.query=(async(sql:string,values?:unknown[],callback?:unknown)=>{
   if(typeof callback==='function'||typeof values==='function')return (original as unknown as (...args:unknown[])=>unknown)(sql,values,callback);
   if(typeof sql!=='string')throw Error('observer_query_shape_gap');
   const continuation=sql.startsWith('SELECT e.* FROM incoming_ai_event e JOIN reply_rescan r');
   if(continuation){
    if(!locked)throw Error('observer_first_lock_missing');
    context={mode:'continuation'};last=null;branch=null;
    const snapshot=(await query(`SELECT txid_current()::text transaction_id,pg_backend_pid() backend_pid,clock_timestamp() database_utc,
     (SELECT jsonb_agg(x) FROM (SELECT e.id,e.tenant_id,e.mailbox_id,e.owner_id,e.generation,e.capture_state,e.capture_phase,e.capture_service_seq,e.window_start,e.window_end,e.window_completed_at,e.next_attempt_at,e.lease_until,e.attempt_deadline,e.expires_at,e.source,e.uid,e.uidvalidity,e.authenticated_run_id,e.authenticated_attempt,r.run_id,r.attempt,r.state scan_state,r.uidvalidity scan_uidvalidity,r.provenance,p.scan_complete,p.completed_at,d.state due_state,d.due_at,d.next_check_at,d.owner_id poll_owner,d.generation poll_generation,EXISTS(SELECT 1 FROM capacity_lease l WHERE l.mailbox_id=e.mailbox_id AND l.state='active' AND l.expires_at>clock_timestamp()) capacity_active,EXISTS(SELECT 1 FROM suppression s WHERE s.tenant_id=e.tenant_id AND s.recipient_hash=e.authenticated_recipient_hash) suppressed FROM incoming_ai_event e LEFT JOIN reply_rescan r ON r.tenant_id=e.tenant_id AND r.mailbox_id=e.mailbox_id LEFT JOIN mailbox_poll p ON p.mailbox_id=e.mailbox_id LEFT JOIN runtime_due d ON d.mailbox_id=e.mailbox_id AND d.kind='poll' WHERE e.window_start IS NOT NULL AND e.capture_state IN ('pending','claimed') ORDER BY e.window_end,e.capture_service_seq,e.id LIMIT 4) x) events,
     (SELECT jsonb_agg(x) FROM (SELECT urgent.mailbox_id,urgent.state,urgent.next_check_at,hp.completed_at FROM runtime_due urgent JOIN mailbox_poll hp ON hp.mailbox_id=urgent.mailbox_id WHERE urgent.kind='poll' AND urgent.state='ready' AND urgent.next_check_at<=clock_timestamp() AND hp.completed_at+interval '30 seconds'<=clock_timestamp()+interval '5 seconds' ORDER BY hp.completed_at,urgent.mailbox_id LIMIT 30) x) urgent_headers,
     (SELECT jsonb_agg(jsonb_build_object('slot',slot,'operation',operation,'owner_process',owner_process,'owner_host',owner_host,'mailbox',mailbox_id,'purpose',operation_purpose,'header_reserved',header_reserved,'free',operation IS NULL) ORDER BY slot) FROM transport_operation WHERE protocol='imap') slots`)).rows[0];
    emit({kind:'entry',...context,snapshot,gaps:['sender_decryption_binding_not_observed','authority_binding_observed_by_actual_following_queries','read_committed_snapshot_not_query_predicate_reexecution'],sourceBindings:sources.map(s=>({name:s.name,sha256:hash(s.sql)}))});
   }
   const finish=sql.startsWith("UPDATE runtime_due SET state='ready',owner_id=NULL,lease_until=NULL,reason='ready',failure_count=0,due_at=$5");
   const denied=sql.startsWith('UPDATE runtime_due SET due_at=$2,next_check_at=$2');
   if(context&&sql.startsWith('SELECT 1 FROM incoming_ai_event WHERE window_end>')){
    if(!locked)throw Error('observer_first_lock_missing');
    const snapshot=(await query(`SELECT txid_current()::text transaction_id,pg_backend_pid() backend_pid,clock_timestamp() database_utc,
     (SELECT jsonb_agg(x) FROM (SELECT id,mailbox_id,owner_id,generation,capture_service_seq,source,uid,uidvalidity,authenticated_run_id,authenticated_attempt,capture_state,window_start,window_end,next_attempt_at,attempt_deadline,expires_at FROM incoming_ai_event WHERE capture_state='pending' AND window_start IS NULL AND source='imap_headers' AND attempt_deadline>clock_timestamp() ORDER BY capture_service_seq,id LIMIT 3) x) frontier,
     (SELECT jsonb_agg(x) FROM (SELECT e.id,e.mailbox_id,e.owner_id,e.generation,e.capture_service_seq,e.capture_state,e.window_start,e.window_end,e.next_attempt_at,e.attempt_deadline,e.expires_at,e.source,e.uid,e.uidvalidity,e.authenticated_run_id,e.authenticated_attempt,r.run_id,r.attempt,r.state scan_state,r.uidvalidity scan_uidvalidity,r.provenance,p.scan_complete,p.uidvalidity poll_uidvalidity,p.completed_at,
       e.authenticated_root_message_id=j.message_id root_binding,e.authenticated_recipient_hash=n.recipient_hash recipient_binding,
       EXISTS(SELECT 1 FROM capacity_lease l WHERE l.mailbox_id=e.mailbox_id AND l.state='active' AND l.expires_at>clock_timestamp()) capacity_active,
       EXISTS(SELECT 1 FROM suppression s WHERE s.tenant_id=e.tenant_id AND s.recipient_hash=e.authenticated_recipient_hash) suppressed
      FROM incoming_ai_event e LEFT JOIN reply_rescan r ON r.tenant_id=e.tenant_id AND r.mailbox_id=e.mailbox_id LEFT JOIN mailbox_poll p ON p.mailbox_id=e.mailbox_id LEFT JOIN enrollment n ON n.tenant_id=e.tenant_id AND n.id=e.enrollment_id LEFT JOIN send_job j ON j.tenant_id=e.tenant_id AND j.mailbox_id=e.mailbox_id AND j.id=e.root_job_id AND j.enrollment_id=e.enrollment_id AND j.parent_id IS NULL WHERE e.mailbox_id=$1 ORDER BY e.capture_service_seq,e.id LIMIT 4) x) events,
     (SELECT jsonb_agg(jsonb_build_object('slot',slot,'operation',operation,'owner_process',owner_process,'mailbox',mailbox_id,'free',operation IS NULL,'purpose',operation_purpose,'header_reserved',header_reserved) ORDER BY slot) FROM transport_operation WHERE protocol='imap') slots,
     (SELECT jsonb_build_object('transport_revision',m.transport_revision,'mailbox_state',m.state,'credentials_present',m.credential_envelope IS NOT NULL,'grant_revision',g.revision,'grant_state',g.state,'scope_kind',g.scope->>'scope','capabilities',g.scope->'capabilities','grant_mailbox_revision',g.scope->>'mailboxTransportRevision','config_fingerprint',g.scope->>'configFingerprint','grant_expires_at',g.scope->>'expiresAt','tenant_binding',g.scope->>'tenant'=m.tenant_id::text,'mailbox_binding',g.scope->>'mailbox'=m.id::text,'smtp_host_binding',g.scope->>'smtpHost'=m.metadata->>'smtpHost','imap_host_binding',g.scope->>'imapHost'=m.metadata->>'imapHost','smtp_port_binding',g.scope->>'smtpPort'=m.metadata->>'smtpPort','imap_port_binding',g.scope->>'imapPort'=m.metadata->>'imapPort') FROM mailbox m LEFT JOIN transport_grant g ON g.mailbox_id=m.id AND g.tenant_id=m.tenant_id WHERE m.id=$1) authority`,[context.mailbox])).rows[0];
    emit({kind:'entry',...context,snapshot,expectedConfigFingerprint,gaps:['sender_decryption_binding_not_observed','read_committed_snapshot_not_query_predicate_reexecution'],sourceBindings:sources.map(s=>({name:s.name,sha256:hash(s.sql)}))});
   }
   let result;try{result=await query(sql,values);}catch(error){if(context)emit({kind:'query_error',...context,querySha256:hash(sql),source:sources.find(s=>s.sql.includes(sql))?.name??null,code:/^[A-Za-z0-9_]{1,64}$/.test(String((error as {code?:unknown}).code))?(error as {code?:unknown}).code:null});throw error;}
   if(sql==='BEGIN'){locked=false;context=null;last=null;}
   if(/SELECT pg_advisory_xact_lock\(7,\s*1\)/.test(sql))locked=true;
   if(finish&&result.rowCount){context={mailbox:values?.[0],claimOwner:values?.[2],claimGeneration:values?.[3],inheritedNow:values?.[4]};last=null;branch=null;emit({kind:'query',...context,stage:'settled_header_finish',querySha256:hash(sql),source:'runtime/store',sourceSha256:hash(sources.find(s=>s.name==='runtime/store')!.sql),rowCount:result.rowCount});}
   else if(context){
    if(continuation){const source=sources.find(s=>s.sql.includes(sql));emit({kind:'query',...context,stage:'continuation_select',querySha256:hash(sql),source:source?.name??null,sourceSha256:source?hash(source.sql):null,sourceAstSha256:astBindings.find(b=>b.sql===sql)?.astSha256??null,rowCount:result.rowCount,selectedEvent:result.rows[0]?.id??null,selectedOwner:result.rows[0]?.owner_id??null,selectedGeneration:result.rows[0]?.generation??null,selectedPhase:result.rows[0]?.capture_phase??null});context={...context,event:result.rows[0]?.id??null,mailbox:result.rows[0]?.mailbox_id??null};}
    else if(denied){emit({kind:'result',...context,outcome:'null',branch:branch??'non_sql_branch_gap',lastQuerySha256:last,rowCount:result.rowCount,gap:'non_sql_sender_or_deadline_branch_if_last_eligibility_select_returned_row'});context=null;}
    else if(sql.startsWith("UPDATE incoming_ai_event SET capture_state='claimed',owner_id=$7")){emit({kind:'result',...context,outcome:'opened',event:values?.[0],owner:values?.[6],generation:result.rows[0]?.generation,windowStart:values?.[1],windowEnd:values?.[2],rowCount:result.rowCount,querySha256:hash(sql)});context=null;}
    else if(!['COMMIT','ROLLBACK'].includes(sql)){
     last=hash(sql);const source=sources.find(s=>s.sql.includes(sql)),label=stage(sql);
     if((label==='pending_continuation'&&result.rowCount)||(label==='live_windows'&&Number(result.rows[0]?.n)>=3)||(label==='eligible_frontier'&&!result.rowCount)||(label==='body_header_due'&&result.rowCount)||(label==='potential_body_occupancy'&&Number(result.rows[0]?.n)>=3)||(label==='mailbox_occupied'&&result.rowCount)||(label==='free_slot'&&!result.rowCount))branch=label;
     if(label==='transport_authority')branch='transport_authority_denial';if(label==='eligible_frontier'&&result.rowCount)branch=null;
     emit({kind:'query',...context,stage:label,querySha256:last,source:source?.name??null,sourceSha256:source?hash(source.sql):null,sourceAstSha256:astBindings.find(b=>b.sql===sql)?.astSha256??null,rowCount:result.rowCount,count:sql.startsWith('SELECT count(*) AS n')?result.rows[0]?.n:null,selectedEvent:sql.startsWith('SELECT e.*,p.completed_at')?result.rows[0]?.id:null});
    }
   }
   if(sql==='COMMIT'||sql==='ROLLBACK'){if(context?.mode==='continuation')emit({kind:'result',...context,outcome:'transaction_end',lastQuerySha256:last,gap:'non_sql_authority_sender_revision_or_deadline_result_not_inferred'});context=null;locked=false;}
   return result;
  }) as typeof client.query;
 });
}

// Parent-owned additive cohort seed. Workers never seed, reset, or relabel evidence.
export async function seedBodyPressureCohort(){
 const {randomUUID}=await import('node:crypto'),{readFile}=await import('node:fs/promises');
 const {loadConfig}=await import('../src/config.js'),{createPool,migrate}=await import('../src/db.js'),{application}=await import('../src/server.js');
 const {seedTestEntitlement}=await import('./billing-fixture.js');
 const {transportInput}=await import('./f09-transport-fixture.js'),{encryptCredentials}=await import('../src/mailboxes/crypto.js');
 const {publishTransportGrant,transportFingerprint}=await import('../src/mailboxes/transport-authority.js');
 const config={...loadConfig(),pollMode:'live_provider' as const,dispatchMode:'live_provider' as const},pool=createPool(config.databaseUrl);
 if((await pool.query('SELECT current_database() AS db')).rows[0].db!=='n7f11_a8')throw Error('fixture_database_denied');
 const lease=JSON.parse(await readFile(process.env.N7_DB_OWNERSHIP_LEASE!,'utf8'));if(lease.database!=='n7f11_a8'||lease.owner_role!==(await pool.query('SELECT current_user AS role')).rows[0].role)throw Error('fixture_owner_denied');
 await migrate(pool);
 await pool.query("INSERT INTO transport_operation(protocol,slot) VALUES('smtp',1),('smtp',2),('imap',1),('imap',2),('imap',3),('imap',4) ON CONFLICT DO NOTHING");
 if(Number((await pool.query("SELECT count(*) AS n FROM transport_operation WHERE operation IS NOT NULL")).rows[0].n)||Number((await pool.query("SELECT count(*) AS n FROM capacity_lease WHERE state='active'")).rows[0].n))throw Error('cohort_requires_empty_owned_capacity');
 // Recreate the migration's initial reservation only in a proved empty test cohort.
 const {eligibilityTransaction}=await import('../src/consent/transaction.js');await eligibilityTransaction(pool,async client=>{
  if((await client.query('SELECT 1 FROM transport_operation WHERE operation IS NOT NULL')).rowCount)throw Error('cohort_requires_empty_owned_capacity');
  const reserved=(await client.query("SELECT slot FROM transport_operation WHERE protocol='imap' AND header_reserved FOR UPDATE")).rows;if(reserved.length===0)await client.query("UPDATE transport_operation SET header_reserved=true WHERE protocol='imap' AND slot=4");
  if((await client.query("SELECT slot FROM transport_operation WHERE protocol='imap'")).rowCount!==4||(await client.query("SELECT slot FROM transport_operation WHERE protocol='imap' AND header_reserved")).rowCount!==1)throw Error('cohort_header_reservation_invalid');
 });
 const app=await application(config,pool,{resolver:async()=>[{address:'8.8.8.8',family:4}]}),token=(await readFile(process.env.OPERATOR_TOKEN_FILE!,'utf8')).trim();
 const actors:{tenant_id:string;account_id:string}[]=[],connected:string[]=[],participants:{tenant:string;mailbox:string;root:string;enrollment:string;recipient:string}[]=[],mailboxes=new Map<string,{headers:Buffer}>();
 for(let i=0;i<3;i++){const actor={tenant_id:randomUUID(),account_id:randomUUID()};actors.push(actor);await pool.query('INSERT INTO tenant(id) VALUES($1)',[actor.tenant_id]);await pool.query("INSERT INTO account(id,tenant_id,email,password_hash) VALUES($1,$2,$3,'fixture')",[actor.account_id,actor.tenant_id,actor.account_id+'@example.test']);await seedTestEntitlement(pool,actor.tenant_id);}
 for(let i=0;i<100;i++){
  const actor=actors[i%3]!,mailbox=(await app.mailboxes.save(actor.tenant_id,{...transportInput,label:'body cohort '+i,senderAddress:`sender-${i}@example.test`,imapUsername:'pending'})).id;connected.push(mailbox);
  const input={...transportInput,senderAddress:`sender-${i}@example.test`,imapUsername:mailbox};await pool.query("UPDATE mailbox SET state='verified_test',credential_envelope=$2 WHERE id=$1",[mailbox,encryptCredentials(input,actor.tenant_id,mailbox,config.credentialKeyring)]);
  if(i>=30)continue;
  await pool.query("INSERT INTO capacity_lease(id,tenant_id,mailbox_id,state,expires_at) VALUES($1,$2,$1,'active',clock_timestamp()+interval '120 seconds')",[mailbox,actor.tenant_id]);
  await app.consents.act(actor,mailbox,{scope:'pool',action:'grant',affirmative:true,scopeVersion:1});
  const recipient=`recipient-${i}@example.test`,campaign=await app.consents.campaign(actor,{steps:[{subject:'First',body:'Fixture',delayHours:24},{subject:'Next',body:'Fixture',delayHours:24}],recipients:[{address:recipient,fields:{}}]});
  await app.consents.act(actor,mailbox,{scope:'campaign',action:'grant',affirmative:true,scopeVersion:campaign.content_version,campaignId:campaign.id,recipientFingerprint:campaign.recipient_fingerprint});await app.campaigns.start(actor,campaign.id,{mailboxIds:[mailbox]},new Date());
  const root=(await pool.query("UPDATE send_job SET state='submitted',message_id='<body-cohort-'||id::text||'@example.test>' WHERE mailbox_id=$1 AND step=0 RETURNING id,enrollment_id,message_id",[mailbox])).rows[0];
  participants.push({tenant:actor.tenant_id,mailbox,root:root.id,enrollment:root.enrollment_id,recipient});mailboxes.set(mailbox,{headers:Buffer.from(`From: ${recipient}\r\nMessage-ID: <cohort-${mailbox}@example.test>\r\nReferences: ${root.message_id}\r\n\r\n`)});
  await publishTransportGrant(pool,config,token,actor.tenant_id,mailbox,'0',{scope:'transport',tenant:actor.tenant_id,mailbox,capabilities:['smtp_submit','imap_headers','imap_body'],smtpHost:input.smtpHost,smtpPort:465,imapHost:input.imapHost,imapPort:993,mailboxTransportRevision:'0',configFingerprint:transportFingerprint(config.providerAllowlist),expiresAt:new Date(Date.now()+1200000).toISOString()});
 }
 return {pool,config,actors,connected,participants,mailboxes,seededAt:Date.now()};
}
