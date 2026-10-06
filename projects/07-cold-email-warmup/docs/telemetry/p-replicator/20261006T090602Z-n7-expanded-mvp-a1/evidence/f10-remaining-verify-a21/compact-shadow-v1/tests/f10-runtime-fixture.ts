import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
export async function runtimeFixture(count=5){
 const config=loadConfig(),pool=createPool(config.databaseUrl);
 assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'n7f10_a2','only the explicitly owned A2 disposable database may be reset');

 await migrate(pool);await pool.query('TRUNCATE tenant CASCADE');await pool.query('UPDATE runtime_reconcile SET after_created_at=NULL,after_mailbox=NULL WHERE id=1');
 await pool.query("INSERT INTO transport_operation(protocol,slot) VALUES('smtp',1),('smtp',2),('imap',1),('imap',2),('imap',3),('imap',4) ON CONFLICT DO NOTHING");
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
