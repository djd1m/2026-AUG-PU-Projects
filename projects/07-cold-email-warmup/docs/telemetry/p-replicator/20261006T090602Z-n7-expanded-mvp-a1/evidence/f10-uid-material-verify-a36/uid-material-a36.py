from pathlib import Path
import json,hashlib,importlib.util,fcntl,difflib
R=Path('/tmp/n7-f10-uid-material-verify-a36');S=R/'compact-shadow-a36';N='/tmp/n7-expanded-runtime-20261006/bin/node';sha=lambda f:hashlib.sha256(Path(f).read_bytes()).hexdigest();spec=importlib.util.spec_from_file_location('nr',R/'native-run-a36.py');nr=importlib.util.module_from_spec(spec);spec.loader.exec_module(nr);plan=json.loads((R/'uid-plan-a36.json').read_text());inv=json.loads((R/'shadow-complete-inputs-a36.json').read_text());write=lambda n,x:(R/n).write_text(json.dumps(x,indent=2)+'\n');results=[];baselines={}
def originalcheck():
 drift=[f for f,h in inv.items() if sha(S/f)!=h];assert not drift,drift;nr.candidate_check();return drift
write('uid-command-manifest-a36.json',{'utc':nr.now(),'runner_sha256':sha(__file__),'native_runner_sha256':sha(R/'native-run-a36.py'),'guard_sha256':sha(R/'guard-a36.mjs'),'preload_sha256':sha(R/'suite-output-a36.mjs'),'plan_sha256':sha(R/'uid-plan-a36.json'),'all_shadow_input_sha256':sha(R/'shadow-complete-inputs-a36.json'),'positive_inventory':[{'mechanism':c['name'],'mode':mode,'file':c['file'].format(mode=mode),'title':c['title'],'command':[N,'node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','--test-name-pattern=^'+c['title']+'$',c['file'].format(mode=mode)],'predicate':c['predicate']} for c in plan for mode in ['source','compiled']]})
lock=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
try:
 originalcheck();assert not nr.nodes();assert nr.status()['counts']=={'occupied_slots':0,'runtime_claims':0,'other_sessions':0}
 for c in plan:
  for mode in ['source','compiled']:
   originalcheck();name=c['name']+'-'+mode;file=c['file'].format(mode=mode);cmd=[N,'node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','--test-name-pattern=^'+c['title']+'$',file];key=(mode,file,c['title']);e={'name':name,'predicate':c['predicate'],'command':cmd,'source_binding':'exact current src/replies modules through tsx' if mode=='source' else 'copied identical positive title with direct dist/replies imports and inherited compiled native child'}
   if key not in baselines:baselines[key]=nr.run(name+'-baseline',cmd,S,c['budget_s'])
   e['baseline']=baselines[key];assert e['baseline']['native_exit']==0;e['baseline_test_count_exact1']='# tests 1\n' in (R/(name+'-baseline.tap')).read_text() if (R/(name+'-baseline.tap')).exists() else True;assert e['baseline_test_count_exact1'];original={x['path']:(S/x['path']).read_bytes() for x in c['changes']};e['original_sha256']={f:hashlib.sha256(b).hexdigest() for f,b in original.items()}
   try:
    for x in c['changes']:
     f=S/x['path'];t=f.read_text();assert t.count(x['old'])==1;(R/(name+'-'+f.name+'.patch')).write_text(''.join(difflib.unified_diff(t.splitlines(True),t.replace(x['old'],x['new']).splitlines(True),fromfile=x['path'],tofile=x['path'])));f.write_text(t.replace(x['old'],x['new']))
    e['mutated_sha256']={f:sha(S/f) for f in original};e['negative']=nr.run(name+'-negative',cmd,S,c['budget_s'])
   finally:
    for f,b in original.items():(S/f).write_bytes(b)
   e['restored_sha256']={f:sha(S/f) for f in original};assert e['restored_sha256']==e['original_sha256'];e['restored']=nr.run(name+'-restored',cmd,S,c['budget_s']);q=e['negative'];e['status']='caught_material_assertion' if q['native_exit']!=0 and q['assertion_failure'] and q['failure_titles'] and e['restored']['native_exit']==0 and '# tests 1\n' in (R/(name+'-negative.tap')).read_text() and '# tests 1\n' in (R/(name+'-restored.tap')).read_text() else 'not_caught_material';results.append(e);write('uid-material-results-a36.json',results);print('UID_RESULT '+name+' '+e['status'],flush=True)
finally:
 write('uid-material-terminal-a36.json',{'utc':nr.now(),'results':results,'shadow_drift':originalcheck(),'source_drift':nr.candidate_check(),'nodes':nr.nodes(),'PG':nr.snapshot(),'DB':nr.status(),'mutex':'released after this receipt'});fcntl.flock(lock,fcntl.LOCK_UN);lock.close()
