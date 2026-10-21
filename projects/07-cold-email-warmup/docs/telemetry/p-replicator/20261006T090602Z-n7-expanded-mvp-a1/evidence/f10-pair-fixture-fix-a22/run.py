from pathlib import Path
import os,json,hashlib,subprocess,datetime,time,signal,fcntl
R=Path('/tmp/n7-f10-pair-fixture-fix-a22');P=Path('/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup');S=R/'compact-shadow';A=Path('/tmp/n7-f10-remaining-verify-a21');sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat();before=json.loads((R/'before-manifest.json').read_text());target='tests/f10-runtime-integration.test.ts';results=[];script_sha=sha(__file__)
def write(n,v):(R/n).write_text(json.dumps(v,indent=2)+'\n')
def nodes():
 out=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   if not os.readlink(p/'exe').endswith('/node'):continue
   raw=(p/'cmdline').read_bytes()+(p/'environ').read_bytes()
   if any(str(x).encode() in raw for x in [R,A]):
    f=(p/'stat').read_text().split(') ')[1].split();out.append({'pid':int(p.name),'startticks':f[19],'state':f[0]})
  except(OSError,IndexError):pass
 return out
snapshot=lambda:json.loads(subprocess.check_output(['node',str(R/'pg-snapshot.mjs')],cwd=P,env=os.environ,text=True,timeout=10))
def integrity():
 drift=[f for f,h in before.items() if f!=target and sha(P/f)!=h];assert not drift,drift
 m=json.loads(Path('/tmp/n7-f10-capacity-fixture-fix-a19/final-manifest.json').read_text());d=json.loads(Path('/tmp/n7-f10-capacity-fixture-fix-a19/database-source-manifest.json').read_text());old=[f for g in ['source','build'] for f,h in m[g].items() if sha(P/f)!=h]+[f for f,h in d['db'].items() if sha(P/f)!=h];assert not old,old
 return {'candidate_drift_except_target':drift,'source120_build73_SQL15_drift':old,'test_sha256':sha(P/target)}
def run(name,cwd):
 assert time.time()+85<datetime.datetime.fromisoformat('2026-10-06T20:53:30+00:00').timestamp();assert not nodes(),nodes();pre=snapshot();assert pre['quiescent'],pre
 v=os.statvfs(R);assert v.f_bavail*v.f_frsize>2*1024**3
 cmd=['node','node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','--test-name-pattern=automatic pool allocation skips pair conflicts and remains idempotent',target]
 write(name+'-ready.json',{'at':now(),'command':cmd,'cwd':str(cwd),'budget_s':70,'PG':pre,'owned_nodes':nodes(),'mutex':'held','disk_available_bytes':v.f_bavail*v.f_frsize,'candidate':integrity(),'inputs':{'fixture':sha(cwd/target),'pool_store':sha(cwd/'src/pool/store.ts'),'runner':script_sha,'guard':sha(R/'guard.mjs'),'pg_snapshot':sha(R/'pg-snapshot.mjs')},'environment':{'DATABASE_NAME':os.environ['DATABASE_NAME'],'NODE_OPTIONS':os.environ['NODE_OPTIONS'],'credentials':'available; values omitted'}})
 start=time.monotonic()
 with open(R/(name+'.tap'),'w') as tap,open(R/(name+'.stderr'),'w') as err:
  child=subprocess.Popen(cmd,cwd=cwd,env=os.environ,stdout=tap,stderr=err,start_new_session=True);f=Path('/proc/'+str(child.pid)+'/stat').read_text().split(') ')[1].split();launch={'at':now(),'pid':child.pid,'startticks':f[19],'pgid':child.pid,'runner_pid':os.getpid()};write(name+'-launched.json',launch);print('NATIVE_LAUNCHED',name,json.dumps(launch),flush=True);timed=False
  try:code=child.wait(timeout=70)
  except subprocess.TimeoutExpired:
   timed=True;os.killpg(child.pid,signal.SIGTERM)
   try:code=child.wait(timeout=5)
   except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait(timeout=5)
 native={'at':now(),'native_returncode':code,'timed_out':timed,'elapsed_ms':(time.monotonic()-start)*1000,**launch};native['at']=now();write(name+'-native-exit.json',native);post=snapshot();assert post['quiescent'],post;assert not nodes(),nodes();tap=(R/(name+'.tap')).read_text();out={**native,'PG':post,'owned_nodes':nodes(),'tap_sha256':sha(R/(name+'.tap')),'stderr_sha256':sha(R/(name+'.stderr')),'named_assertion':"pair conflict must skip to another eligible tenant" in tap,'assertion_error':'ERR_ASSERTION' in tap,'candidate':integrity()};write(name+'-terminal.json',out);results.append(out);print('NATIVE_TERMINAL',name,code,timed,flush=True);return out
assert os.environ['DATABASE_NAME']=='n7f10_a2'
lock=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
store=S/'src/pool/store.ts';store_original=store.read_bytes()
try:
 assert not nodes(),nodes();pre=snapshot();assert pre['quiescent'],pre;write('pre-edit.json',{'at':now(),'PG':pre,'nodes':nodes(),'mutex':'held','candidate':integrity()})
 assert sha(P/target)=='ce3cdd57354a75dab304567eaf686347e9c8df13469402f4fbedbaf61bdb9695'
 subprocess.run(['patch','--batch','--forward',str(P/target),str(A/'pair-correction-fixture.patch')],check=True,stdout=subprocess.PIPE)
 assert sha(P/target)=='97fb303f49f165f1242b37172644bcab5300ecd06358d3263ba0935bb03d1501';(S/target).write_bytes((P/target).read_bytes())
 positive=run('positive',P);assert positive['native_returncode']==0 and not positive['timed_out']
 subprocess.run(['patch','--batch','--forward',str(store),str(A/'first-pair-conflict-forced-existing-pair-store.ts.patch')],check=True,stdout=subprocess.PIPE)
 assert sha(store)=='013329d7e2dc07b3a613d7e02a1d379c11c70726df56f7713125ea2b13514217'
 try:negative=run('negative',S);assert negative['native_returncode']==1 and negative['named_assertion'] and negative['assertion_error'] and not negative['timed_out']
 finally:store.write_bytes(store_original)
 assert sha(store)==hashlib.sha256(store_original).hexdigest()
 restored=run('restored',S);assert restored['native_returncode']==0 and not restored['timed_out']
 write('results.json',{'at':now(),'checks':results,'passed':True,'overall_F10_acceptance':False})
finally:
 store.write_bytes(store_original);post=snapshot();remaining=nodes();integrity();fcntl.flock(lock,fcntl.LOCK_UN);lock.close()
 probe=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(probe,fcntl.LOCK_EX|fcntl.LOCK_NB);fcntl.flock(probe,fcntl.LOCK_UN);probe.close()
 write('terminal.json',{'at':now(),'results':results,'PG':post,'remaining_owned_nodes':remaining,'mutex':'released and independently reacquired','candidate':integrity(),'shadow_store_restored':sha(store)==hashlib.sha256(store_original).hexdigest(),'runner_sha256_unchanged':sha(__file__)==script_sha});assert post['quiescent'] and not remaining
