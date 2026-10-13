from pathlib import Path
p=Path('/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup/tests')
f=p/'f10-runtime-process-fixture.ts'
s=f.read_text().replace('abort.signal,false,fixture','abort.signal,process.env.F10_FAIR_ONCE===\'1\',fixture');f.write_text(s)
f=p/'f10-runtime-fixture.ts'
f.write_text(f.read_text()+'''
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
  await pool.query("INSERT INTO capacity_lease(id,tenant_id,mailbox_id,state,expires_at) VALUES($1,$2,$1,'active',clock_timestamp()+interval '120 seconds')",[id,tenant]);
  await publishTransportGrant(pool,config,token,tenant,id,'0',{scope:'transport',tenant,mailbox:id,capabilities:['imap_headers'],smtpHost:input.smtpHost,smtpPort:465,imapHost:input.imapHost,imapPort:993,mailboxTransportRevision:'0',configFingerprint:transportFingerprint(config.providerAllowlist),expiresAt:new Date(Date.now()+600000).toISOString()});
  if(label!=='E')await operator.capture(tenant,id,{uidvalidity:'1',uidNext:3001,observedAt:new Date(),provenance:'imap_headers'});
 }
 const {RuntimeStore}=await import('../src/runtime/store.js');await new RuntimeStore(pool).maintenance();
 await pool.query("UPDATE runtime_due SET due_at=clock_timestamp()-CASE WHEN mailbox_id=$1 THEN interval '1 minute' ELSE interval '2 minutes' END,next_check_at=clock_timestamp() WHERE kind='poll'",[boxes[4]]);
 const sockets=new Set<import('node:tls').TLSSocket>(),traffic:unknown[]=[],timers=new Set<NodeJS.Timeout>();let maxSockets=0;
 const server=createServer(base.cert,socket=>{
  sockets.add(socket);maxSockets=Math.max(maxSockets,sockets.size);let pending='',auth=false,label='';socket.on('error',()=>{});socket.once('close',()=>sockets.delete(socket));socket.write('* OK fixture\\r\\n');
  socket.on('data',chunk=>{pending+=chunk.toString();for(;;){const end=pending.indexOf('\\r\\n');if(end<0)break;const line=pending.slice(0,end);pending=pending.slice(end+2);
   if(auth){auth=false;label=Buffer.from(line,'base64').toString().split('\\0')[1]!;socket.write('a2 OK authenticated\\r\\n');continue;}
   if(line==='a1 CAPABILITY')socket.write('* CAPABILITY IMAP4rev1 AUTH=PLAIN\\r\\na1 OK done\\r\\n');
   else if(line==='a2 AUTHENTICATE PLAIN'){auth=true;socket.write('+ challenge\\r\\n');}
   else if(line==='a3 EXAMINE INBOX')socket.write(`* 1 EXISTS\\r\\n* OK [UIDVALIDITY 1] generation\\r\\n* OK [UIDNEXT ${label==='E'?1:3001}] next\\r\\na3 OK [READ-ONLY] examined\\r\\n`);
   else if(line.startsWith('a4 UID FETCH ')){const started=Date.now(),mailbox=boxes[['A','B','C','D','E'].indexOf(label)]!;void pool.query("SELECT service_seq,owner_id,state,due_at FROM runtime_due WHERE mailbox_id=$1 AND kind='poll'",[mailbox]).then(r=>traffic.push({label,mailbox,started,beforeIO:r.rows[0]}));const timer=setTimeout(()=>{timers.delete(timer);traffic.push({label,mailbox,started,completed:Date.now(),command:line});if(!socket.destroyed)socket.write('a4 OK complete\\r\\n');},label==='E'?0:5000);timers.add(timer);}
   else socket.destroy();
  }});
 });await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 return {...c,boxes,options:{...base.options!,imap993:(server.address() as {port:number}).port},traffic,sockets,get maxSockets(){return maxSockets;},async close(){for(const t of timers)clearTimeout(t);for(const s of sockets)s.destroy();await new Promise<void>(r=>server.close(()=>r()));await base.close();await pool.end();}};
}
''')
f=p/'f10-runtime-protocol.test.ts'
f.write_text(f.read_text()+'''

test('native five-second rescans yield fairly to later healthy E across competing worker restart',{timeout:145000},async()=>{
 const {adversarialFixture}=await import('./f10-runtime-fixture.js'),{readFile}=await import('node:fs/promises');const c=await adversarialFixture(),begun=Date.now(),children:{child:ReturnType<typeof fork>;exit:Promise<unknown>;pid:number;startticks:string;drained:boolean}[]=[],phases:unknown[]=[];let failure:string|null=null;
 const start=async(once:boolean)=>{const child=fork(new URL('./f10-runtime-process-fixture.ts',import.meta.url),[],{execArgv:[],env:{...process.env,F10_FAIR_ONCE:once?'1':'0'},stdio:['ignore','pipe','pipe','ipc'],serialization:'advanced'}),entry={child,pid:child.pid!,startticks:(await readFile(`/proc/${child.pid}/stat`,'utf8')).split(') ')[1]!.split(' ')[19]!,drained:false,exit:Promise.resolve<unknown>(null)};let stderr='';child.stderr?.on('data',b=>{stderr+=b.toString();});entry.exit=new Promise(r=>child.once('exit',(code,signal)=>r({pid:child.pid,code,signal,stderr,drained:entry.drained,at:Date.now()})));children.push(entry);child.on('message',m=>{if((m as {drained?:boolean}).drained)entry.drained=true;});const ready=new Promise<void>((r,j)=>{child.once('message',m=>(m as {started?:boolean}).started?r():j(new Error('worker_start_failed')));child.once('error',j);});child.send(c.options);await ready;return entry;};
 let events:Record<string,any>[]=[],final:Record<string,any>[]=[];
 try{
  await c.pool.query('DROP TABLE IF EXISTS n7_fair_events');await c.pool.query('CREATE TABLE n7_fair_events(event_id bigserial,at timestamptz DEFAULT clock_timestamp(),kind text,mailbox uuid,body jsonb)');
  await c.pool.query(`CREATE OR REPLACE FUNCTION n7_fair_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
   IF TG_TABLE_NAME='runtime_due' AND NEW.kind='poll' THEN
    IF NEW.service_seq<>OLD.service_seq THEN INSERT INTO n7_fair_events(kind,mailbox,body) VALUES('turn',NEW.mailbox_id,to_jsonb(NEW)); END IF;
    IF NEW.state='claimed' AND (OLD.state<>'claimed' OR OLD.owner_id IS DISTINCT FROM NEW.owner_id) THEN INSERT INTO n7_fair_events(kind,mailbox,body) VALUES('selection',NEW.mailbox_id,to_jsonb(NEW)); END IF;
    IF OLD.state='claimed' AND NEW.state<>'claimed' THEN INSERT INTO n7_fair_events(kind,mailbox,body) VALUES('yield',NEW.mailbox_id,to_jsonb(NEW)); END IF;
   ELSIF TG_TABLE_NAME='reply_rescan' THEN INSERT INTO n7_fair_events(kind,mailbox,body) VALUES('page',NEW.mailbox_id,to_jsonb(NEW));
   ELSIF TG_TABLE_NAME='mailbox_poll' THEN INSERT INTO n7_fair_events(kind,mailbox,body) VALUES('poll',NEW.mailbox_id,to_jsonb(NEW)); END IF; RETURN NEW; END $$`);
  for(const table of ['runtime_due','reply_rescan','mailbox_poll'])await c.pool.query(`CREATE TRIGGER n7_fair_record AFTER UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION n7_fair_record()`);
  const first=await start(true);phases.push({phase:'first_start',pid:first.pid,at:Date.now()});const firstExit=await first.exit;phases.push({phase:'actual_first_join',at:Date.now(),outcome:firstExit});assert.equal((firstExit as {code:number}).code,0);
  const before=(await c.pool.query("SELECT mailbox_id,due_at,service_seq FROM runtime_due WHERE kind='poll' ORDER BY mailbox_id")).rows;phases.push({phase:'persisted_before_restart',at:Date.now(),rows:before});
  await start(false);await start(false);phases.push({phase:'competing_restart',at:Date.now()});
  while(Date.now()-begun<112000){
   events=(await c.pool.query('SELECT * FROM n7_fair_events ORDER BY event_id')).rows;
   const selected=events.filter(e=>e.kind==='selection'),initial=selected.slice(0,4),fifth=selected[4];
   if(fifth){assert.equal(new Set(initial.map(e=>e.mailbox)).size,4,'A-D each receive their first quantum');assert.ok(initial.every(e=>c.boxes.slice(0,4).includes(e.mailbox)),'A-D first four claims');assert.equal(fifth.mailbox,c.boxes[4],'fair E selection precedes ANY A-D second quantum after actual restart');}
   const ePoll=(await c.pool.query('SELECT completed_at,scan_complete FROM mailbox_poll WHERE mailbox_id=$1',[c.boxes[4]])).rows[0];if(ePoll?.scan_complete){assert.ok(ePoll.completed_at.getTime()-begun<=30000,'healthy E actual completion <=30s');}
   const held=(await c.pool.query("SELECT count(*) FROM reply_rescan WHERE mailbox_id=ANY($1::uuid[]) AND state='rescan_incomplete'",[c.boxes.slice(0,4)])).rows[0].count;
   if(held==='4'){phases.push({phase:'all_long_scans_held',at:Date.now()});await new Promise(r=>setTimeout(r,1200));break;}await new Promise(r=>setTimeout(r,100));
  }
  for(const e of children.slice(1))e.child.kill('SIGTERM');for(const e of children.slice(1))phases.push({phase:'competing_join',at:Date.now(),outcome:await e.exit});
  events=(await c.pool.query('SELECT * FROM n7_fair_events ORDER BY event_id')).rows;final=(await c.pool.query("SELECT d.*,r.pages,r.state AS scan_state,p.scan_complete,p.completed_at FROM runtime_due d LEFT JOIN reply_rescan r ON r.mailbox_id=d.mailbox_id LEFT JOIN mailbox_poll p ON p.mailbox_id=d.mailbox_id WHERE d.kind='poll' ORDER BY d.mailbox_id")).rows;
  const selected=events.filter(e=>e.kind==='selection'),turns=events.filter(e=>e.kind==='turn');assert.equal(final.length,5,'all five participants remain denominator');assert.ok(selected.find(e=>e.mailbox===c.boxes[4])!.at.getTime()-begun<=60000,'healthy E selection <=60s');assert.ok(final.find(e=>e.mailbox===c.boxes[4])!.scan_complete,'E really completed');
  for(const id of c.boxes.slice(0,4)){const row=final.find(e=>e.mailbox_id===id)!;assert.equal(row.scan_complete,false,'partial A-D page must never count as full poll completion');assert.equal(row.pages,20,'literal twenty-page attempt cap');assert.equal(row.scan_state,'rescan_incomplete','exhausted long scan stays explicitly held');assert.equal(row.reason,'rescan_incomplete');assert.equal(row.due_at.getTime(),before.find(e=>e.mailbox_id===id)!.due_at.getTime(),'original due age survives yields and restart');}
  for(const claim of selected){const preceding=turns.filter(e=>e.mailbox===claim.mailbox&&e.event_id<claim.event_id),last=preceding.at(-1)!;assert.equal(last.body.service_seq,claim.body.service_seq,'selected durable service turn precedes native I/O');assert.equal(preceding.filter(e=>e.body.service_seq===claim.body.service_seq).length,1,'each selected durable turn advances exactly once');}
  assert.equal(turns.length,selected.length,'yield/restart never resets durable service sequence');assert.ok(c.maxSockets<=4,'fixed four physical IMAP lanes');assert.equal((await c.pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0','all native transport ownership joined');
 }catch(error){failure=error instanceof Error?error.message:String(error);throw error;}finally{
  for(const e of children)if(e.child.exitCode===null&&e.child.signalCode===null)e.child.kill('SIGTERM');const joins=await Promise.all(children.map(e=>e.exit));
  events=(await c.pool.query('SELECT * FROM n7_fair_events ORDER BY event_id')).rows;
  await writeFile(`${process.env.F10_EVIDENCE_DIR}/fairness-${begun}.json`,JSON.stringify({begun,ended:Date.now(),failure,phases,children:children.map(e=>({pid:e.pid,startticks:e.startticks})),joins,traffic:c.traffic,maxSockets:c.maxSockets,events,final,participants:c.boxes.map((id,i)=>({label:['A','B','C','D','E'][i],id,selections:events.filter(e=>e.kind==='selection'&&e.mailbox===id),pages:events.filter(e=>e.kind==='page'&&e.mailbox===id),fullPollCompletions:events.filter(e=>e.kind==='poll'&&e.mailbox===id&&e.body.scan_complete),incomplete:events.filter(e=>e.kind==='page'&&e.mailbox===id&&e.body.state==='rescan_incomplete'),ownership:events.filter(e=>['selection','yield'].includes(e.kind)&&e.mailbox===id)}))},null,2)+'\\n');
  for(const table of ['runtime_due','reply_rescan','mailbox_poll'])await c.pool.query(`DROP TRIGGER IF EXISTS n7_fair_record ON ${table}`);await c.pool.query('DROP FUNCTION IF EXISTS n7_fair_record()');await c.close();
 }
});
''')
