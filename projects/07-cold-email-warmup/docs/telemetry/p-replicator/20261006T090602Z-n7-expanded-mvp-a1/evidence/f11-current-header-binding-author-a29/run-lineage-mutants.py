from pathlib import Path
import subprocess,os,json,hashlib,datetime
p=Path.cwd();r=Path('/tmp/n7-f11-current-header-binding-author-a29');f=p/'src/runtime/store.ts';candidate=f.read_text();env=dict(os.environ);results=[]
try:
 for name,s in [('independent_poll_owner',candidate.replace('admission?.slot?.operation??randomUUID()','randomUUID()')),('copy_stale_busy_operation',candidate.replace('admission?.slot?.operation??randomUUID()',"admission?.slot?.operation??(admission?.reason==='transport_busy'?(await c.query(\"SELECT operation FROM transport_operation WHERE protocol='imap' AND mailbox_id=$1 AND operation IS NOT NULL\",[row.mailbox_id])).rows[0].operation:randomUUID())"))]:
  f.write_text(s);launch={'name':name,'UTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runtimeSHA':hashlib.sha256(f.read_bytes()).hexdigest(),'contextSHA':hashlib.sha256((p/'src/replies/context-store.ts').read_bytes()).hexdigest(),'testSHA':hashlib.sha256((p/'tests/f10-runtime-integration.test.ts').read_bytes()).hexdigest(),'guardSHA':hashlib.sha256((r/'guard-a29.mjs').read_bytes()).hexdigest()};(r/(name+'-launch.json')).write_text(json.dumps(launch,indent=2)+'\n')
  with (r/(name+'.log')).open('w') as out: result=subprocess.run(['node','--import','tsx','--test','--test-name-pattern=native poll claim reserves','tests/f10-runtime-integration.test.ts'],env=env,stdout=out,stderr=subprocess.STDOUT,timeout=20)
  results.append({'name':name,'exit':result.returncode,'sourceSHA':launch['runtimeSHA']});f.write_text(candidate)
finally:f.write_text(candidate);(r/'lineage-mutant-results.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results))
