from pathlib import Path
import os,json,hashlib,subprocess,datetime,time,signal,fcntl,sys
R=Path('/tmp/n7-f10-atomic-admission-a31');P=Path(sys.argv[2] if len(sys.argv)>2 else '/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup');stage=sys.argv[1];sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat();N='/tmp/n7-expanded-runtime-20261006/bin/node'
def write(n,v):(R/n).write_text(json.dumps(v,indent=2)+'\n')
def nodes():
 out=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   if not os.readlink(p/'exe').endswith('/node'):continue
   if str(R).encode() in (p/'environ').read_bytes():
    f=(p/'stat').read_text().split(') ')[1].split();out.append({'pid':int(p.name),'startticks':f[19],'state':f[0]})
  except(OSError,IndexError):pass
 return out
snapshot=lambda:json.loads(subprocess.check_output([N,str(R/'pg-snapshot-a31.mjs')],cwd=P,env=os.environ,text=True,timeout=10))
assert os.environ['DATABASE_NAME']=='n7f10_a2';lock=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
try:
 assert not nodes(),nodes();pre=snapshot();assert pre['quiescent'],pre;v=os.statvfs(R);cmd=[N,'node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','--test-name-pattern='+('owned fairness instrumentation removes forced stale triggers idempotently' if stage=='not-used-a31' else 'native five-second rescans'), 'tests/f10-runtime-protocol.test.ts'];scriptsha=sha(__file__)
 files=['src/mailboxes/transport-slots.ts','src/runtime/store.ts','src/runtime/worker.ts','src/replies/adapter.ts','tests/f10-runtime-protocol.test.ts','tests/f10-runtime-fixture.ts','tests/f10-runtime-process-fixture.ts','tests/f09-transport-fixture.ts','tests/diagnostics-fixture.ts','dist/runtime/store.js','dist/runtime/worker.js']
 write(stage+'-ready.json',{'at':now(),'PG':pre,'mutex':'held','command':cmd,'cwd':str(P),'runner_sha256':scriptsha,'guard_sha256':sha(R/'guard-a31.mjs'),'snapshot_sha256':sha(R/'pg-snapshot-a31.mjs'),'inputs':{f:sha(P/f) for f in files},'disk_available_bytes':v.f_bavail*v.f_frsize,'warn_lt_2GiB':v.f_bavail*v.f_frsize<2*1024**3})
 with open(R/(stage+'.tap'),'w') as tap,open(R/(stage+'.stderr'),'w') as err:
  child=subprocess.Popen(cmd,cwd=P,env=os.environ,stdout=tap,stderr=err,start_new_session=True);fields=Path('/proc/'+str(child.pid)+'/stat').read_text().split(') ')[1].split();start=time.monotonic();launch={'started_at':now(),'pid':child.pid,'startticks':fields[19],'runner_pid':os.getpid()};write(stage+'-launched.json',launch);print('NATIVE_LAUNCHED',stage,json.dumps(launch),flush=True);timed=False
  try:code=child.wait(timeout=150)
  except subprocess.TimeoutExpired:
   timed=True;os.killpg(child.pid,signal.SIGTERM)
   try:code=child.wait(timeout=8)
   except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait(timeout=8)
 write(stage+'-native-exit.json',{'finished_at':now(),'native_returncode':code,'timed_out':timed,'elapsed_ms':(time.monotonic()-start)*1000,**launch});post=snapshot();remaining=nodes();write(stage+'-terminal.json',{'at':now(),'PG':post,'remaining_owned_nodes':remaining,'native_returncode':code,'timed_out':timed,'runner_sha256_unchanged':sha(__file__)==scriptsha,'inputs_unchanged':all(sha(P/f)==json.loads((R/(stage+'-ready.json')).read_text())['inputs'][f] for f in files),'tap_sha256':sha(R/(stage+'.tap')),'stderr_sha256':sha(R/(stage+'.stderr'))});assert post['quiescent'] and not remaining,(post,remaining);print('NATIVE_TERMINAL',stage,code,timed,flush=True)
finally:fcntl.flock(lock,fcntl.LOCK_UN);lock.close()
sys.exit(code)
