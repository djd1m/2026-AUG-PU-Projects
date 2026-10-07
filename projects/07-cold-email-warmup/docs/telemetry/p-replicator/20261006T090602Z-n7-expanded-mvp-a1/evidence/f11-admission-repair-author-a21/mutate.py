from pathlib import Path
import subprocess,hashlib,json,datetime
root=Path('/tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup');scratch=Path('/tmp/n7-f11-admission-repair-author-a21');p=root/'src/mailboxes/transport-slots.ts';base=p.read_text();results=[]
variants={'all_imap_count':base.replace(" AND (operation_purpose='body' OR operation_purpose IS NULL)",''),'no_rotation':base.replace("if(purpose==='body'&&!(await c.query", "if(false&&purpose==='body'&&!(await c.query"),'ignore_unknown':base.replace("(operation_purpose='body' OR operation_purpose IS NULL)","operation_purpose='body'")}
try:
 for name,mutant in variants.items():
  assert mutant!=base;p.write_text(mutant);before=hashlib.sha256(p.read_bytes()).hexdigest();started=datetime.datetime.now(datetime.timezone.utc).isoformat()
  with (scratch/(name+'.log')).open('w') as log:
   child=subprocess.Popen(['/tmp/n7-expanded-runtime-20261006/bin/node','--test','--test-name-pattern','^F11 durable purpose admission','tests/f10-runtime-protocol.test.ts'],cwd=root,stdout=log,stderr=subprocess.STDOUT)
   pid=child.pid;exitcode=child.wait(timeout=30)
  results.append({'mutation':name,'pid':pid,'started':started,'joined':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitcode':exitcode,'sha_before':before,'sha_after':hashlib.sha256(p.read_bytes()).hexdigest()});p.write_text(base)
finally:
 p.write_text(base);(scratch/'mutation-results.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results))
