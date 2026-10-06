from pathlib import Path
import os,json,hashlib,subprocess,datetime,time,signal,fcntl,sys
R=Path('/tmp/n7-f10-atomic-admission-verify-a32');P=Path('/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup');N='/tmp/n7-expanded-runtime-20261006/bin/node';now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat();sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(n,v):(R/n).write_text(json.dumps(v,indent=2)+'\n')
def nodes(roots):
 out=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   if not os.readlink(p/'exe').endswith('/node'):continue
   env=(p/'environ').read_bytes()
   if any(root.encode() in env for root in roots):
    f=(p/'stat').read_text().split(') ')[1].split();out.append({'pid':int(p.name),'startticks':f[19],'state':f[0]})
  except(OSError,IndexError):pass
 return out
snapshot=lambda:json.loads(subprocess.check_output([N,str(R/'pg-snapshot-a32.mjs')],cwd=P,env=os.environ,text=True,timeout=10))
assert os.environ['DATABASE_NAME']=='n7f10_a2';ctx=json.loads((R/'context_manifest.json').read_text());freeze=datetime.datetime.fromisoformat(ctx['freeze_utc']).timestamp();deadline=datetime.datetime.fromisoformat(ctx['deadline_utc']).timestamp();inventory=json.loads((R/'command-inventory.json').read_text());lock=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);results=[]
try:
 prior=nodes([str(R),'/tmp/n7-f10-atomic-admission-a31']);assert not prior,prior;pre=snapshot();assert pre['quiescent'],pre
 write('preflight.json',{'utc':now(),'PG':pre,'prior_owned_nodes':prior,'mutex':'held','source_manifest_verified_before_launch':True,'runner_sha256':sha(__file__),'guard_sha256':sha(R/'guard-a32.mjs'),'snapshot_sha256':sha(R/'pg-snapshot-a32.mjs'),'command_inventory_sha256':sha(R/'command-inventory.json'),'node_sha256':sha(N),'disk_available_bytes':os.statvfs('/').f_bavail*os.statvfs('/').f_frsize})
 for stage in inventory['stages']:
  name=stage['name'];budget=stage['timeout_seconds']+20
  if time.time()>=freeze or time.time()+budget>deadline-80:
   write(name+'-not-started.json',{'at':now(),'reason':'known budget cannot fit with joins and seal reserve','remaining_seconds':deadline-time.time(),'needed_seconds':budget});continue
  start=time.monotonic();timed=False;observations=[]
  with open(R/(name+'.tap'),'w') as tap,open(R/(name+'.stderr'),'w') as err:
   child=subprocess.Popen(stage['command'],cwd=P,env=os.environ,stdout=tap,stderr=err,start_new_session=True);f=Path('/proc/'+str(child.pid)+'/stat').read_text().split(') ')[1].split();launch={'at':now(),'pid':child.pid,'startticks':f[19],'runner_pid':os.getpid(),'command':stage['command'],'inventory_sha256':sha(R/'command-inventory.json')};write(name+'-launch.json',launch);print('LAUNCHED '+name+' '+json.dumps(launch),flush=True)
   while child.poll() is None:
    try:code=child.wait(timeout=min(20,max(0.1,stage['timeout_seconds']-(time.monotonic()-start))))
    except subprocess.TimeoutExpired:
     try:
      snap=snapshot();snap['host']={'loadavg':Path('/proc/loadavg').read_text().strip(),'mem_available_kb':next((l.split(':')[1].strip() for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:')),None),'disk_available_bytes':os.statvfs('/').f_bavail*os.statvfs('/').f_frsize};observations.append(snap);write(name+'-pg-observer.json',observations)
     except Exception as e:observations.append({'at':now(),'snapshot_error':type(e).__name__})
     print('RUNNING '+name+' '+str(round(time.monotonic()-start,1)),flush=True)
     if time.monotonic()-start>=stage['timeout_seconds']:
      timed=True;write(name+'-timeout.json',{'at':now(),'elapsed_seconds':time.monotonic()-start,'last_PG':observations[-1] if observations else None,'owned_nodes':nodes([str(R)]),'last_tap_lines':(R/(name+'.tap')).read_text().splitlines()[-30:]});os.killpg(child.pid,signal.SIGTERM)
      try:code=child.wait(timeout=8)
      except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait(timeout=8)
      break
   code=child.wait();post=snapshot();owned=nodes([str(R)]);result={'stage':name,'started':launch,'joined_utc':now(),'native_returncode':code,'timed_out':timed,'elapsed_seconds':time.monotonic()-start,'PG':post,'remaining_owned_nodes':owned,'tap_sha256':sha(R/(name+'.tap')),'stderr_sha256':sha(R/(name+'.stderr'))};results.append(result);write(name+'-exit.json',result);write('results.json',results);print('JOINED '+name+' '+str(code)+' '+str(result['elapsed_seconds']),flush=True)
   assert post['quiescent'] and not owned,(post,owned)
   if timed:break
 finally_post=snapshot();write('runner-terminal.json',{'at':now(),'results':results,'PG':finally_post,'owned_nodes':nodes([str(R)]),'mutex':'released after this receipt','runner_sha256':sha(__file__),'guard_sha256':sha(R/'guard-a32.mjs')})
finally:fcntl.flock(lock,fcntl.LOCK_UN);lock.close()
