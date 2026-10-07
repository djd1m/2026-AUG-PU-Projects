from pathlib import Path
import json,hashlib,itertools
r=Path('/tmp/n7-f11-fifo-header-priority-author-a32');p=Path('/tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup');current=(p/'tests/f10-runtime-integration.test.ts').read_text()
# Exact reversible source transforms from the preserved bounded fixture corrections.
versions=[current]
old=current.replace("window_start=statement_timestamp(),window_end=statement_timestamp()+interval '12 seconds',window_completed_at=statement_timestamp()","window_start=clock_timestamp(),window_end=clock_timestamp()+interval '12 seconds',window_completed_at=clock_timestamp()").replace("['recipient AEAD',\"UPDATE enrollment SET recipient_envelope='{}'::jsonb\",[]],\n    ['activity',\"UPDATE capacity_lease SET state='waiting_capacity',expires_at=NULL\",[]],\n    ",'');versions.append(old)
old=old.replace("mailbox_id=($2::uuid[])[slot],owner_process=gen_random_uuid(),owner_host='test'","mailbox_id=$2,owner_process=gen_random_uuid(),owner_host='test'").replace("[ordinary.tenant,[1,4,7,10].map(i=>c.participants[i]!.mailbox)]],","[ordinary.tenant,ordinary.mailbox]],").replace("operation_purpose=NULL WHERE protocol='imap' AND slot>=2","operation_purpose=NULL WHERE protocol='imap' AND slot<=3");versions.append(old)
old=old.replace('assert.notEqual(Number(turns.mailbox),100)','assert.ok(Number(turns.mailbox)>100)');versions.append(old)
old=old.replace("const selected=await runtime.claim('poll');assert.ok(selected);await runtime.cancel(selected);assert.ok(expected.some","const selected=await runtime.claim('poll');assert.ok(selected);assert.ok(expected.some").replace("assert.equal(selected.owner_id,runtime.pollAdmission(selected)!.slot!.operation);","assert.equal(selected.owner_id,runtime.pollAdmission(selected)!.slot!.operation);await runtime.cancel(selected);").replace(" }finally{const claims=(await c.pool.query(\"SELECT * FROM runtime_due WHERE state='claimed'\")).rows;for(const owned of claims)await runtime.cancel(owned);await c.pool.query('TRUNCATE tenant CASCADE');await c.pool.end();}\n});\n"," }finally{await c.pool.end();}\n});\n");versions.append(old)
known=[*r.glob('candidate-*v1.ts'),*r.glob('baseline-*.ts')]
known+=[p/'src/runtime/store.ts',p/'src/replies/context-store.ts',p/'tests/f10-runtime-protocol.test.ts']
bysha={hashlib.sha256(f.read_bytes()).hexdigest():f.read_bytes() for f in known}
for v in versions:bysha[hashlib.sha256(v.encode()).hexdigest()]=v.encode()
result=[]
for name in ['baseline-red','candidate-focused-v1','candidate-focused-v2','candidate-focused-v3','candidate-focused-v4']:
 receipt=json.loads((r/(name+'-launch.json')).read_text());files={}
 for rel in ['src/runtime/store.ts','src/replies/context-store.ts','tests/f10-runtime-integration.test.ts','tests/f10-runtime-protocol.test.ts']:
  sha=receipt['files'][str(p/rel)];target=r/(name+'-reconstructed-'+rel.replace('/','_'))
  if sha in bysha:target.write_bytes(bysha[sha]);files[str(target)]=sha
  else:files[rel]={'sha256':sha,'unavailableExactSnapshot':True}
 result.append({'launch':name,'sourceFiles':files})
(r/'early-immutable-snapshot-reconstruction.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
