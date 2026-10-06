# Static limited derivative of A21 mutations-v2.py, five compiled owner cases only.
from pathlib import Path
import os,json,hashlib,subprocess,time,datetime,fcntl
R=Path('/tmp/n7-f10-atomic-admission-verify-a32');S=R/'slot-shadow-a32';P=Path('/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup');N='/tmp/n7-expanded-runtime-20261006/bin/node';plan=json.loads((R/'slot-mutation-plan-a32.json').read_text());ctx=json.loads((R/'context_manifest.json').read_text());freeze=datetime.datetime.fromisoformat(ctx['freeze_utc']).timestamp();sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
def write(n,x):(R/n).write_text(json.dumps(x,indent=2)+'\n')
def owned():
 out=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   if os.readlink(p/'exe').endswith('/node') and str(R).encode() in (p/'environ').read_bytes():out.append(int(p.name))
  except OSError:pass
 return out
assert (R/'runner-terminal.json').exists(),'baseline terminal absent';assert not owned(),owned();assert time.time()+35<freeze,'five short baselines/mutations/restores no longer fit prefreeze';assert os.environ['DATABASE_NAME']=='n7f10_a2';lock=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);results=[];mod=S/'src/mailboxes/transport-slots.js';original=mod.read_bytes()
def run(name):
 assert time.time()<freeze,'no new child after freeze';assert not owned();start=time.monotonic()
 with (R/(name+'.tap')).open('w') as tap,(R/(name+'.stderr')).open('w') as err:
  c=subprocess.Popen(plan['command'],cwd=S,env=os.environ,stdout=tap,stderr=err);ticks=Path('/proc/'+str(c.pid)+'/stat').read_text().split(') ')[1].split()[19];code=c.wait(timeout=10)
 assert not owned();text=(R/(name+'.tap')).read_text();x={'utc':now(),'pid':c.pid,'startticks':ticks,'native_exit':code,'elapsed_seconds':time.monotonic()-start,'test_count_exact2':'# tests 2\n' in text,'assertion_failure':'ERR_ASSERTION' in text,'failure_titles':[l for l in text.splitlines() if l.startswith('not ok')],'executed_compiled_module_sha256':sha(mod),'tap_sha256':sha(R/(name+'.tap'))};write(name+'-exit.json',x);return x
try:
 pre=json.loads(subprocess.check_output([N,str(R/'pg-owned-status-a32.mjs')],env=os.environ,cwd=P,text=True,timeout=10));assert pre['counts']=={'occupied_slots':0,'runtime_claims':0,'other_sessions':0},pre;write('slot-mutations-preflight.json',{'utc':now(),'DB':pre,'ownnodes':owned(),'mutex':'held','runner_sha256':sha(__file__),'plan_sha256':sha(R/'slot-mutation-plan-a32.json'),'guard_sha256':sha(R/'guard-a32.mjs'),'command':plan['command'],'shadow_inputs':{f:sha(S/f) for f in plan['shadow_inputs']}})
 baseline=run('slot-baseline');assert baseline['native_exit']==0 and baseline['test_count_exact2'],baseline
 for c in plan['cases']:
  if time.time()+12>=freeze:results.append({'name':c['name'],'status':'pending_budget'});continue
  s=mod.read_text();assert s.count(c['old'])==1;mod.write_text(s.replace(c['old'],c['new']));mutantsha=sha(mod)
  try:negative=run('slot-'+c['name']+'-negative')
  finally:mod.write_bytes(original)
  restored=run('slot-'+c['name']+'-restored');result={'name':c['name'],'expected_material_assertion':c['assertion'],'baseline':baseline,'negative':negative,'restored':restored,'original_sha256':hashlib.sha256(original).hexdigest(),'mutant_sha256':mutantsha,'status':'caught_material_assertion' if negative['native_exit']!=0 and negative['assertion_failure'] and negative['test_count_exact2'] and restored['native_exit']==0 and restored['test_count_exact2'] else 'not_caught_material'};results.append(result);write('slot-mutation-results.json',results);print('SLOT_MUTANT '+c['name']+' '+result['status'],flush=True)
finally:
 mod.write_bytes(original);write('slot-mutation-terminal.json',{'utc':now(),'results':results,'shadow_restored':sha(mod)==hashlib.sha256(original).hexdigest(),'candidate_input_unchanged':all(sha(P/f)==h for f,h in plan['input_files'].items()),'remaining_owned_nodes':owned(),'mutex':'released after receipt'});fcntl.flock(lock,fcntl.LOCK_UN);lock.close()
