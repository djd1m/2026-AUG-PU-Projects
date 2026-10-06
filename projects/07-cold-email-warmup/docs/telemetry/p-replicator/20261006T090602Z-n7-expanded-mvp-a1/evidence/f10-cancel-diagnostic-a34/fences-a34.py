from pathlib import Path
import json,hashlib,importlib.util,fcntl,os
R=Path('/tmp/n7-f10-cancel-diagnostic-a34');S=R/'compact-shadow-a34';N='/tmp/n7-expanded-runtime-20261006/bin/node';sha=lambda f:hashlib.sha256(Path(f).read_bytes()).hexdigest();spec=importlib.util.spec_from_file_location('nr',R/'native-run-a34.py');nr=importlib.util.module_from_spec(spec);spec.loader.exec_module(nr);cases=json.loads((R/'fence-plan-a34.json').read_text());write=lambda n,x:(R/n).write_text(json.dumps(x,indent=2)+'\n');results=[];compiled=S/'tests/a34-compiled-f09.test.ts';compiled.write_text((S/'tests/f09-live-transport.test.ts').read_text().replace('../src/','../dist/'))
for c in cases:
 f=S/'dist/replies/worker.js';text=f.read_text();old='await runtimeGuard(c);' if 'runtime-result' in c['name'] else 'await transport?.(c);';assert text.count(old)==1;c['changes'].append({'path':'dist/replies/worker.js','old':old,'new':'','anchor_count':1})
write('fence-command-manifest-a34.json',{'utc':nr.now(),'runner_sha256':sha(__file__),'guard_sha256':sha(R/'guard-a34.mjs'),'preload_sha256':sha(R/'suite-output-a34.mjs'),'native_runner_sha256':sha(R/'native-run-a34.py'),'compiled_test_sha256':sha(compiled),'cases':cases,'modes':['existing TS/source test','copied identical title with direct imports bound to frozen compiled dist'],'budget_seconds_per_child':20})
lock=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
try:
 assert nr.status()['counts']=={'occupied_slots':0,'runtime_claims':0,'other_sessions':0};assert not nr.nodes();nr.candidate_check()
 for c in cases:
  for mode,test in [('source','tests/f09-live-transport.test.ts'),('compiled','tests/a34-compiled-f09.test.ts')]:
   name=c['name']+'-'+mode;cmd=[N,'node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','--test-name-pattern='+c['title'],test];e={'name':name,'command':cmd,'baseline':nr.run(name+'-baseline',cmd,S,20)};assert e['baseline']['native_exit']==0;original={x['path']:(S/x['path']).read_bytes() for x in c['changes']};e['original_sha256']={f:hashlib.sha256(b).hexdigest() for f,b in original.items()}
   try:
    for x in c['changes']:
     f=S/x['path'];t=f.read_text();assert t.count(x['old'])==1;f.write_text(t.replace(x['old'],x['new']))
    e['mutated_sha256']={f:sha(S/f) for f in original};e['negative']=nr.run(name+'-negative',cmd,S,20)
   finally:
    for f,b in original.items():(S/f).write_bytes(b)
   e['restored']=nr.run(name+'-restored',cmd,S,20);e['restored_sha256']={f:sha(S/f) for f in original};q=e['negative'];e['status']='caught_material_assertion' if q['native_exit']!=0 and q['assertion_failure'] and q['failure_titles'] and e['restored']['native_exit']==0 else 'not_caught_material';results.append(e);write('fence-results-a34.json',results);print(name+' '+e['status'],flush=True)
finally:
 write('fence-terminal-a34.json',{'utc':nr.now(),'results':results,'candidate_drift':nr.candidate_check(),'nodes':nr.nodes(),'PG':nr.snapshot(),'DB':nr.status(),'mutex':'released after receipt'});fcntl.flock(lock,fcntl.LOCK_UN);lock.close()
