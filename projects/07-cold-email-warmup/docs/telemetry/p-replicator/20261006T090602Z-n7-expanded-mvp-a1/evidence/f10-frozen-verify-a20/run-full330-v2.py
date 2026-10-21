from pathlib import Path
import os,sys,json,hashlib,datetime,time,subprocess,threading,fcntl,signal
R=Path('/tmp/n7-f10-frozen-verify-a20');L=json.loads((R/'launch.json').read_text());P=Path(L['worktree'])/'projects/07-cold-email-warmup';STAGE='full330';BUDGET=420;CMD=['node', 'node_modules/tsx/dist/cli.mjs', '--test', '--test-concurrency=1', 'tests/expanded-mvp-04.test.ts'];SCRIPT=Path(__file__);observer=None
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(name,v): (R/name).write_text(json.dumps(v,indent=2)+'\n')
def nodes():
 a=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   if not os.readlink(p/'exe').endswith('/node'):continue
   if observer is not None and int(p.name)==observer.pid:continue
   if any(x.startswith(b'NODE_OPTIONS=') and b'/tmp/n7-f10-frozen-verify-a20/' in x for x in (p/'environ').read_bytes().split(b'\0')):
    f=(p/'stat').read_text().split(') ')[1].split();a.append({'pid':int(p.name),'startticks':f[19],'state':f[0],'command_sha256':hashlib.sha256((p/'cmdline').read_bytes()).hexdigest()})
  except(OSError,IndexError):pass
 return a
assert not nodes(),nodes()
m=json.loads(Path(L['source_build_manifest']).read_text());assert sha(L['source_build_manifest'])==L['source_build_manifest_sha256']
for g in ['source','build']:
 for f,h in m[g].items():assert sha(P/f)==h,f
assert os.environ['DATABASE_NAME']=='n7f10_a2' and os.environ['TMPDIR']==str(R)
lock=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert not (R/'observer-current.json').exists() or STAGE=='fullpg'
if (R/'observer-current.json').exists():(R/'observer-current.json').unlink()
observer=subprocess.Popen(['/tmp/n7-expanded-runtime-20261006/bin/node',str(R/'observer-v1.mjs')],env=os.environ,cwd=P,stdout=subprocess.DEVNULL,stderr=open(R/(STAGE+'-observer.stderr'),'w'))
for _ in range(100):
 if (R/'observer-current.json').exists():break
 if observer.poll() is not None:raise RuntimeError('observer failed before readiness')
 time.sleep(.05)
def snapshot():
 v=json.loads((R/'observer-current.json').read_text());assert v['database']=='n7f10_a2';assert time.time()-datetime.datetime.fromisoformat(v['at'].replace('Z','+00:00')).timestamp()<15;return v

pre=snapshot();assert pre['quiescent'],pre;write(STAGE+'-pre-reset-pg.json',pre)
v=os.statvfs(R);disk={'available_bytes':v.f_bavail*v.f_frsize,'free_inodes':v.f_favail};print('DISK',disk,'WARN_LT_2G',disk['available_bytes']<2*1024**3,flush=True)
inputs=['guard-v1.mjs','suite-output-v2.mjs','observer-v1.mjs','sql-observe-v2.mjs'];fixtures=['tests/diagnostics-fixture.ts','tests/f09-transport-fixture.ts','tests/f10-runtime-fixture.ts','tests/f10-runtime-process-fixture.ts']
ready={'at':now(),'status':'ready','run_id':L['run_id'],'work_unit_id':L['work_unit_id'],'source_revision':L['source_revision'],'manifest_sha256':sha(L['source_build_manifest']),'source_count':120,'build_count':73,'runner_path':str(SCRIPT),'runner_sha256':sha(SCRIPT),'preloads':{n:sha(R/n) for n in inputs},'fixtures':{n:sha(P/n) for n in fixtures},'environment':{'DATABASE_NAME':os.environ['DATABASE_NAME'],'TMPDIR':os.environ['TMPDIR'],'NODE_OPTIONS':os.environ['NODE_OPTIONS'],'credentials':'available; values omitted'},'DB_assertion':pre,'command':CMD,'budget_s':BUDGET,'disk':disk,'sideeffects':['own scratch','n7f10_a2','numeric local TLS'],'source_build_readonly':True};write(STAGE+'-ready.json',ready)
freeze=datetime.datetime.fromisoformat(L['freeze_at']).timestamp();assert time.time()+BUDGET+12<freeze,(now(),'budget does not fit freeze')
start=time.monotonic();child=subprocess.Popen(CMD,cwd=P,env=os.environ,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True,bufsize=1)
f=Path('/proc/'+str(child.pid)+'/stat').read_text().split(') ')[1].split();launch={'at':now(),'pid':child.pid,'startticks':f[19],'pgid':child.pid,'runner_pid':os.getpid(),'runner_sha256':sha(SCRIPT),'mutex':'held'};write(STAGE+'-launched.json',launch);print('NATIVE_LAUNCHED',json.dumps(launch),flush=True)
chron=open(R/(STAGE+'-chronology.jsonl'),'w');mu=threading.Lock()
def drain(stream,name):
 with open(R/(STAGE+'.'+name),'w') as raw:
  for line in stream:
   raw.write(line);raw.flush()
   with mu:chron.write(json.dumps({'at':now(),'stream':name,'line':line.rstrip('\n')})+'\n');chron.flush()
tout=threading.Thread(target=drain,args=(child.stdout,'tap'));terr=threading.Thread(target=drain,args=(child.stderr,'stderr'));tout.start();terr.start();stop=threading.Event();samples=[]
def watch():
 while not stop.is_set():
  a={'at':now(),'owned_node_identities':nodes()}
  try:a['PG']=snapshot()
  except Exception as e:a['PG_error']=type(e).__name__
  samples.append(a);write(STAGE+'-live-snapshots.json',samples)
  stop.wait(8)
sampler=threading.Thread(target=watch);sampler.start();timed_out=False;term=None
try:code=child.wait(timeout=BUDGET)
except subprocess.TimeoutExpired:
 timed_out=True;write(STAGE+'-timeout-before-termination.json',{'at':now(),'owned_node_identities':nodes(),'PG':snapshot()})
 os.killpg(child.pid,signal.SIGTERM)
 try:code=child.wait(timeout=5)
 except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait(timeout=5)
write(STAGE+'-native-exit.json',{'at':now(),'native_returncode':code,'timed_out':timed_out,'elapsed_ms':(time.monotonic()-start)*1000,'pid':child.pid,'startticks':launch['startticks']})
stop.set();sampler.join(timeout=12);tout.join(timeout=5);terr.join(timeout=5);chron.close();time.sleep(5.2);post=snapshot();remaining=nodes();assert not remaining,remaining
observer.terminate();observer_code=observer.wait(timeout=8);assert observer_code==0,observer_code
fcntl.flock(lock,fcntl.LOCK_UN);lock.close();write(STAGE+'-terminal.json',{'at':now(),'native_returncode':code,'timed_out':timed_out,'elapsed_ms':(time.monotonic()-start)*1000,'post_join_PG':post,'remaining_owned_nodes':remaining,'mutex':'released','runner_sha256_unchanged':sha(SCRIPT)==ready['runner_sha256']});print('NATIVE_TERMINAL',code,timed_out,now(),flush=True);sys.exit(124 if timed_out else code)
