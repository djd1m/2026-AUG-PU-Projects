#!/usr/bin/env python3
"""Targeted old-logic mutants in disposable copies; never mutate product files."""
import hashlib,json,pathlib,shutil,subprocess,tempfile
root=pathlib.Path(__file__).resolve().parents[2]
node='/tmp/n6b-f06-node22/bin/node'
out=root/'docs/features/f04b-fix'
mutants=[
 ('reservation-pending','web/public/app.js',"!!reservationPending||!account","!account",'tests/ui-app-races.test.js'),
 ('reservation-selection','web/public/app.js',"if(!scope.valid(token)||generation!==selectionGeneration||intent!==jobIntent)return;\n    if(!intent.resolved(value.job_id,body.idempotency_key))return;","if(!scope.valid(token)||intent!==jobIntent)return;\n    intent.resolved(value.job_id,body.idempotency_key);",'tests/ui-app-races.test.js'),
 ('submitted-key','web/public/ui-state.js',"if(!current || current.key!==key)return false;","if(!current)return false;",'tests/ui-state.test.js'),
 ('stale-rejection','web/public/ui-state.js',"catch(error) {if(token!==generation)throw new Error('stale_account');throw error;}","catch(error) {throw error;}",'tests/ui-app-races.test.js'),
 ('late-detail-render','web/public/app.js',"if(version!==pollVersion||(expectedSelection!==undefined&&expectedSelection!==selectionGeneration))return;","if(version!==pollVersion)return;",'tests/ui-app-races.test.js'),
 ('stable-key','web/public/ui-state.js',"if (!current || JSON.stringify(current.body) !== JSON.stringify(body))", "if (true)",'tests/ui-state.test.js')]
results=[]
for name,path,before,after,test in mutants:
 with tempfile.TemporaryDirectory(prefix='n8-f04b-mutant-') as tmp:
  copy=pathlib.Path(tmp);(copy/'package.json').write_text('{"type":"module"}')
  shutil.copytree(root/'web/public',copy/'web/public');(copy/'tests').mkdir()
  shutil.copyfile(root/test,copy/test)
  target=copy/path;original=target.read_text();assert original.count(before)==1,(name,'unique target missing')
  target.write_text(original.replace(before,after));assert target.read_text()!=original
  run=subprocess.run([node,test],cwd=copy,capture_output=True,text=True,timeout=15)
  log=out/('mutation-'+name+'.log');log.write_text(run.stdout+run.stderr)
  results.append({'name':name,'command':[node,test],'exit_code':run.returncode,'detected':run.returncode!=0,'log':log.name,'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest()})
(out/'mutations.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
if not all(v['detected'] for v in results):raise SystemExit(1)
