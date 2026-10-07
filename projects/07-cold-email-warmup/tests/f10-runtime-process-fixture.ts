import type { ChildRequest } from '../src/mailboxes/transport-lifetime.js';
// Only this trusted test entrypoint accepts IPC fixtures; production CLI cannot.
process.once('message',(value:unknown)=>{const fixture=value as ChildRequest['fixture'];void (async()=>{
 const {loadConfig}=await import(new URL('../dist/config.js',import.meta.url).href),{createPool}=await import(new URL('../dist/db.js',import.meta.url).href);
 const config={...loadConfig(),dispatchMode:'live_provider' as const,pollMode:'live_provider' as const},pool=createPool(config.databaseUrl),abort=new AbortController();
 process.once('SIGTERM',()=>abort.abort());process.once('SIGINT',()=>abort.abort());
 try{const built=await import(new URL('../dist/runtime/worker.js',import.meta.url).href);process.send?.({started:true,execArgv:process.execArgv});await built.runWorker(pool,config,abort.signal,process.env.F10_FAIR_ONCE==='1',fixture);const {readFile}=await import('node:fs/promises');process.send?.({drained:true,stat:await readFile('/proc/self/stat','utf8')});}
 catch(error){process.send?.({failed:true,code:(error as {code?:string}).code??'runtime_failure'});process.exitCode=1;}finally{await pool.end();process.disconnect?.();}
 })();});

// Parent-owned additive cohort seed. Workers never seed, reset, or relabel evidence.
export async function seedBodyPressureCohort(){
 const {randomUUID}=await import('node:crypto'),{readFile}=await import('node:fs/promises');
 const {loadConfig}=await import('../src/config.js'),{createPool,migrate}=await import('../src/db.js'),{application}=await import('../src/server.js');
 const {transportInput}=await import('./f09-transport-fixture.js'),{encryptCredentials}=await import('../src/mailboxes/crypto.js');
 const {publishTransportGrant,transportFingerprint}=await import('../src/mailboxes/transport-authority.js');
 const config={...loadConfig(),pollMode:'live_provider' as const,dispatchMode:'live_provider' as const},pool=createPool(config.databaseUrl);
 if((await pool.query('SELECT current_database() AS db')).rows[0].db!=='n7f11_a8')throw Error('fixture_database_denied');
 const lease=JSON.parse(await readFile(process.env.N7_DB_OWNERSHIP_LEASE!,'utf8'));if(lease.database!=='n7f11_a8'||lease.owner_role!==(await pool.query('SELECT current_user AS role')).rows[0].role)throw Error('fixture_owner_denied');
 await migrate(pool);
 await pool.query("INSERT INTO transport_operation(protocol,slot) VALUES('smtp',1),('smtp',2),('imap',1),('imap',2),('imap',3),('imap',4) ON CONFLICT DO NOTHING");
 if(Number((await pool.query("SELECT count(*) AS n FROM transport_operation WHERE operation IS NOT NULL")).rows[0].n)||Number((await pool.query("SELECT count(*) AS n FROM capacity_lease WHERE state='active'")).rows[0].n))throw Error('cohort_requires_empty_owned_capacity');
 const app=await application(config,pool,{resolver:async()=>[{address:'8.8.8.8',family:4}]}),token=(await readFile(process.env.OPERATOR_TOKEN_FILE!,'utf8')).trim();
 const actors:{tenant_id:string;account_id:string}[]=[],connected:string[]=[],participants:{tenant:string;mailbox:string;root:string;enrollment:string;recipient:string}[]=[],mailboxes=new Map<string,{headers:Buffer}>();
 for(let i=0;i<3;i++){const actor={tenant_id:randomUUID(),account_id:randomUUID()};actors.push(actor);await pool.query('INSERT INTO tenant(id) VALUES($1)',[actor.tenant_id]);await pool.query("INSERT INTO account(id,tenant_id,email,password_hash) VALUES($1,$2,$3,'fixture')",[actor.account_id,actor.tenant_id,actor.account_id+'@example.test']);}
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
