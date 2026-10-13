# Static bounded derivative of A21 mutations-v2.py; no framework or candidate edits.
from pathlib import Path
import os,json,hashlib,datetime,time,fcntl,importlib.util,difflib
R=Path('/tmp/n7-f10-atomic-admission-negatives-a33');S=R/'compact-shadow-a33';P=Path('/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup');N='/tmp/n7-expanded-runtime-20261006/bin/node';sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat();spec=importlib.util.spec_from_file_location('native_a33',R/'native-run-a33.py');runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner);plan=json.loads((R/'combined-material-plan-a33.json').read_text());cases=plan['existing_material17']+plan['new_atomic_material8'];freeze=datetime.datetime.fromisoformat(json.loads((R/'launch-actual.json').read_text())['freeze_utc']).timestamp();inv=json.loads((R/'input-inventory-a33.json').read_text());results=[];baselines={};scriptsha=sha(__file__)
def write(n,x):(R/n).write_text(json.dumps(x,indent=2)+'\n')
def originals():
 drift=[f for f,h in inv['shadow_files'].items() if sha(S/f)!=h];assert not drift,drift;runner.candidate_check();return drift
assert (R/'remaining-f09-terminal.json').exists();assert not runner.nodes();lock=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
try:
 originals();write('material-loop-ready.json',{'utc':now(),'source_head':plan['source_head'],'runner_sha256':scriptsha,'native_runner_sha256':sha(R/'native-run-a33.py'),'guard_sha256':sha(R/'guard-a33.mjs'),'relocation_sha256':sha(R/'suite-output-a33.mjs'),'plan_sha256':sha(R/'combined-material-plan-a33.json'),'shadow_initial_drift':originals(),'cases':len(cases),'mutex':'held'})
 for c in cases:
  key=json.dumps([c['test_file'],c['title']]);needed=c['budget_s']*(2 if key in baselines else 3)+25
  if time.time()+needed>=freeze:results.append({'name':c['name'],'status':'pending_budget','known_needed_seconds':needed});write('material-results-a33.json',results);continue
  originals();name=c['name'];cmd=[N,'node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','--test-name-pattern='+c['title'],c['test_file']];original={x['path']:(S/x['path']).read_bytes() for x in c['changes']};entry={'name':name,'expected_material_assertion':c['expected_material_assertion'],'command':cmd,'original_sha256':{f:hashlib.sha256(b).hexdigest() for f,b in original.items()}}
  try:
   if key not in baselines:baselines[key]=runner.run(name+'-baseline',cmd,S,c['budget_s'])
   entry['baseline']=baselines[key]
   if entry['baseline']['native_exit']!=0:entry['status']='baseline_not_green';results.append(entry);write('material-results-a33.json',results);break
   for x in c['changes']:
    f=S/x['path'];old=f.read_text();assert old.count(x['old'])==x['anchor_count'],name;new=old.replace(x['old'],x['new']);f.write_text(new);(R/(name+'-'+f.name+'.patch')).write_text(''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile=x['path'],tofile=x['path'])))
   entry['mutant_sha256']={f:sha(S/f) for f in original};entry['negative']=runner.run(name+'-negative',cmd,S,c['budget_s']);entry['candidate_after_negative']=runner.candidate_check()
  finally:
   for f,b in original.items():(S/f).write_bytes(b)
   entry['restored_sha256']={f:sha(S/f) for f in original};assert entry['restored_sha256']==entry['original_sha256']
  entry['restored']=runner.run(name+'-restored',cmd,S,c['budget_s']);n=entry['negative'];r=entry['restored'];entry['status']='caught_material_assertion' if n['native_exit']!=0 and n['assertion_failure'] and n['failure_titles'] and r['native_exit']==0 and not n['timed_out'] and not r['timed_out'] else 'not_caught_material';results.append(entry);write('material-results-a33.json',results);print('MATERIAL_RESULT '+name+' '+entry['status'],flush=True)
finally:
 originals();write('material-loop-terminal.json',{'utc':now(),'results':results,'shadow_drift':originals(),'candidate_drift':runner.candidate_check(),'owned_nodes':runner.nodes(),'PG':runner.snapshot(),'DB':runner.status(),'runner_sha256_unchanged':sha(__file__)==scriptsha,'mutex':'released after receipt'});fcntl.flock(lock,fcntl.LOCK_UN);lock.close()
