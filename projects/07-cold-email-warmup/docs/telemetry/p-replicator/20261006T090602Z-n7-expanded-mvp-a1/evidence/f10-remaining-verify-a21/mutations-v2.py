from pathlib import Path
import os,json,hashlib,subprocess,datetime,time,signal,fcntl,difflib,re,sys
R=Path('/tmp/n7-f10-remaining-verify-a21');P=Path('/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup');S=R/'compact-shadow-v1';L=json.loads((R/'launch.json').read_text());cases=json.loads((R/'mutation-inventory-v1.json').read_text())['cases'];inventory=json.loads((R/'shadow-original-byte-inventory.json').read_text());M=json.loads(Path('/tmp/n7-f10-capacity-fixture-fix-a19/final-manifest.json').read_text());D=json.loads(Path('/tmp/n7-f10-capacity-fixture-fix-a19/database-source-manifest.json').read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat();results=[];baselines={};freeze=datetime.datetime.fromisoformat(L['freeze_at']).timestamp();script_sha=sha(__file__)
def write(n,v):(R/n).write_text(json.dumps(v,indent=2)+'\n')
def original_check():
 drift=[f for g in ['source','build'] for f,h in M[g].items() if sha(P/f)!=h]+[f for f,h in D['db'].items() if sha(P/f)!=h];assert not drift,drift
 return {'source120_build73_SQL15_drift':drift}
def nodes():
 out=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   if not os.readlink(p/'exe').endswith('/node'):continue
   if str(R).encode() in (p/'cmdline').read_bytes()+(p/'environ').read_bytes():
    f=(p/'stat').read_text().split(') ')[1].split();out.append({'pid':int(p.name),'startticks':f[19]})
  except(OSError,IndexError):pass
 return out
snapshot=lambda:json.loads(subprocess.check_output(['node',str(R/'pg-snapshot-v1.mjs')],cwd=S,env=os.environ,text=True,timeout=10))
def run(name,cmd,budget):
 assert not nodes(),nodes();pre=snapshot();assert pre['quiescent'],pre;assert time.time()+budget+12<freeze,'native budget no longer fits freeze';v=os.statvfs(R);assert v.f_bavail*v.f_frsize>2*1024**3,'disk below2GiB';ready={'at':now(),'command':cmd,'budget_s':budget,'PG':pre,'runner_sha256':script_sha,'shadow_inputs':{x['path']:sha(S/x['path']) for c in cases for x in c['changes']},'preloads':{n:sha(R/n) for n in ['guard-v1.mjs','suite-output-v2.mjs','pg-snapshot-v1.mjs']},'test_fixture_sha256':{f:sha(S/f) for f in inventory['files'] if f.startswith('tests/')}};write(name+'-ready.json',ready);start=time.monotonic()
 with open(R/(name+'.tap'),'w') as tap,open(R/(name+'.stderr'),'w') as err:
  child=subprocess.Popen(cmd,cwd=S,env=os.environ,stdout=tap,stderr=err,start_new_session=True);fields=Path('/proc/'+str(child.pid)+'/stat').read_text().split(') ')[1].split();la={'at':now(),'pid':child.pid,'startticks':fields[19],'pgid':child.pid};write(name+'-launched.json',la);print('NATIVE_LAUNCHED',name,json.dumps(la),flush=True);timed=False
  try:code=child.wait(timeout=budget)
  except subprocess.TimeoutExpired:
   timed=True;os.killpg(child.pid,signal.SIGTERM)
   try:code=child.wait(timeout=5)
   except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait(timeout=5)
 native={'at':now(),'native_returncode':code,'timed_out':timed,'elapsed_ms':(time.monotonic()-start)*1000,**la};native['at']=now();write(name+'-native-exit.json',native);post=snapshot();owned=nodes();assert not owned,owned;assert post['quiescent'],post;text=(R/(name+'.tap')).read_text();out={**native,'TAP_sha256':sha(R/(name+'.tap')),'failure_titles':[l.strip() for l in text.splitlines() if l.strip().startswith('not ok ')],'assertion_failure':"code: 'ERR_ASSERTION'" in text or 'ERR_ASSERTION' in text,'PG':post,'owned_nodes':owned};write(name+'-terminal.json',out);print('NATIVE_TERMINAL',name,code,timed,flush=True);return out
lock=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
try:
 for c in cases:
  if c['status']!='pending':results.append(c);continue
  if time.time()+c['budget_s']+25>=freeze:results.append({**c,'status':'pending_native_budget'});continue
  name=c['name'];cmd=['node','node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','--test-name-pattern='+c['title'],c['test_file']];key=json.dumps(cmd);original={x['path']:(S/x['path']).read_bytes() for x in c['changes']};entry={'name':name,'expected_material_assertion':c['expected_material_assertion'],'command':cmd,'original_sha256':{f:hashlib.sha256(b).hexdigest() for f,b in original.items()}}
  try:
   original_check()
   if key not in baselines:baselines[key]=run(name+'-baseline',cmd,c['budget_s'])
   entry['baseline']=baselines[key]
   if entry['baseline']['native_returncode']!=0 or entry['baseline']['timed_out']:entry['status']='baseline_not_green';results.append(entry);write('mutation-results.json',results);break
   for x in c['changes']:
    f=S/x['path'];old=f.read_text();assert x['old'] in old;new=old.replace(x['old'],x['new']);f.write_text(new);(R/(name+'-'+f.name+'.patch')).write_text(''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile=x['path'],tofile=x['path'])))
   entry['mutant_sha256']={f:sha(S/f) for f in original};entry['negative']=run(name+'-negative',cmd,c['budget_s']);entry['candidate_after_negative']=original_check()
  finally:
   for f,b in original.items():(S/f).write_bytes(b)
   entry['restored_sha256']={f:sha(S/f) for f in original};assert entry['restored_sha256']==entry['original_sha256'];entry['candidate_after_restore']=original_check()
  entry['restored']=run(name+'-restored',cmd,c['budget_s']);entry['status']='caught_material_assertion' if entry['negative']['native_returncode']!=0 and not entry['negative']['timed_out'] and entry['negative']['assertion_failure'] and entry['restored']['native_returncode']==0 and not entry['restored']['timed_out'] else 'pending_not_caught_or_restored';results.append(entry);write('mutation-results.json',results);print('MUTATION_RESULT',name,entry['status'],flush=True)
finally:
 original_check();fcntl.flock(lock,fcntl.LOCK_UN);lock.close();write('mutation-terminal.json',{'at':now(),'results':results,'runner_sha256_unchanged':sha(__file__)==script_sha,'original_candidate':original_check(),'shadow_drift':[f for f,h in inventory['files'].items() if sha(S/f)!=h],'remaining_owned_nodes':nodes(),'PG':snapshot(),'mutex':'released'})
