from pathlib import Path
import os,json,hashlib,importlib.util,time,fcntl,subprocess,datetime
R=Path('/tmp/n7-f10-atomic-admission-negatives-a33');S=R/'compact-shadow-a33';N='/tmp/n7-expanded-runtime-20261006/bin/node';spec=importlib.util.spec_from_file_location('nr',R/'native-run-a33.py');nr=importlib.util.module_from_spec(spec);spec.loader.exec_module(nr);p=json.loads((R/'combined-material-plan-a33.json').read_text());out=[];sha=lambda f:hashlib.sha256(Path(f).read_bytes()).hexdigest();write=lambda n,x:(R/n).write_text(json.dumps(x,indent=2)+'\n')
write('short-remainder-command.json',{'utc':nr.now(),'runner_sha256':sha(__file__),'guard_sha256':sha(R/'guard-a33.mjs'),'preload_sha256':sha(R/'suite-output-a33.mjs'),'native_runner_sha256':sha(R/'native-run-a33.py'),'cases':[c['name'] for c in p['new_atomic_material8'][5:]],'timeout_seconds_per_child':10,'reason':'previous cancel negative timeout preserved; bounded remaining short probes only'})
lock=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
try:
 c=p['new_atomic_material8'][4];cmd=[N,'node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','--test-name-pattern='+c['title'],c['test_file']];x=nr.run('atomic-cancel-timeout-restored',cmd,S,10);assert x['native_exit']==0;assert nr.status()['counts']=={'occupied_slots':0,'runtime_claims':0,'other_sessions':0};write('timeout-restored-fixture.json',x)
finally:fcntl.flock(lock,fcntl.LOCK_UN);lock.close()
subprocess.run(['python3',str(R/'slot-mutations-a33.py')],check=True,env=os.environ)
lock=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
try:
 for c in p['new_atomic_material8'][5:]:
  if time.time()+40>=nr.freeze:out.append({'name':c['name'],'status':'pending_budget'});write('short-remainder-results.json',out);continue
  cmd=[N,'node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','--test-name-pattern='+c['title'],c['test_file']];e={'name':c['name'],'baseline':nr.run(c['name']+'-short-baseline',cmd,S,10)};assert e['baseline']['native_exit']==0;orig={x['path']:(S/x['path']).read_bytes() for x in c['changes']}
  try:
   for x in c['changes']:
    f=S/x['path'];t=f.read_text();assert t.count(x['old'])==1;f.write_text(t.replace(x['old'],x['new']))
   e['mutant_sha256']={f:sha(S/f) for f in orig};e['negative']=nr.run(c['name']+'-short-negative',cmd,S,10)
  finally:
   for f,b in orig.items():(S/f).write_bytes(b)
  e['restored_sha256']={f:sha(S/f) for f in orig};e['restored']=nr.run(c['name']+'-short-restored',cmd,S,10);q=e['negative'];e['status']='caught_material_assertion' if q['native_exit']!=0 and q['assertion_failure'] and q['failure_titles'] and e['restored']['native_exit']==0 else 'not_caught_material';out.append(e);write('short-remainder-results.json',out);print('SHORT_RESULT '+c['name']+' '+e['status'],flush=True)
finally:
 write('short-remainder-terminal.json',{'utc':nr.now(),'results':out,'candidate_drift':nr.candidate_check(),'owned_nodes':nr.nodes(),'PG':nr.snapshot(),'DB':nr.status(),'mutex':'released after receipt'});fcntl.flock(lock,fcntl.LOCK_UN);lock.close()
