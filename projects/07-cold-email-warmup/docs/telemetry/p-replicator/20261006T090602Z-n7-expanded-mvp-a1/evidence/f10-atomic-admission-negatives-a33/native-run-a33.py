# Narrow native runner derived from A32/A21 runners; exact command as data only.
from pathlib import Path
import os,json,hashlib,subprocess,datetime,time,signal,fcntl,sys
R=Path('/tmp/n7-f10-atomic-admission-negatives-a33');P=Path('/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup');N='/tmp/n7-expanded-runtime-20261006/bin/node';now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat();sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();ctx=json.loads((R/'launch-actual.json').read_text());freeze=datetime.datetime.fromisoformat(ctx['freeze_utc']).timestamp()
def write(n,x):(R/n).write_text(json.dumps(x,indent=2)+'\n')
def nodes():
 out=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   if os.readlink(p/'exe').endswith('/node') and any(x.encode() in (p/'environ').read_bytes() for x in [str(R),'/tmp/n7-f10-atomic-admission-verify-a32']):
    f=(p/'stat').read_text().split(') ')[1].split();out.append({'pid':int(p.name),'startticks':f[19],'state':f[0]})
  except(OSError,IndexError):pass
 return out
snapshot=lambda:json.loads(subprocess.check_output([N,str(R/'pg-snapshot-a33.mjs')],cwd=P,text=True,timeout=10))
status=lambda:json.loads(subprocess.check_output([N,str(R/'pg-owned-status-a33.mjs')],cwd=P,text=True,timeout=10))
def candidate_check():
 m=json.loads(Path('/tmp/n7-f10-atomic-admission-a31/complete-source-build-sql-manifest-v2.json').read_text());d=[f for g in ['sources','build','sql'] for f,h in m[g].items() if sha(P/f)!=h];assert not d,d;return d
def run(name,cmd,cwd,budget):
 assert os.environ['DATABASE_NAME']=='n7f10_a2';assert time.time()+budget+12<freeze,'child budget cannot fit before freeze';assert not nodes(),nodes();pre=snapshot();assert pre['quiescent'],pre;db=status();d=candidate_check();write(name+'-ready.json',{'utc':now(),'command':cmd,'cwd':str(cwd),'timeout_seconds':budget,'PG':pre,'DB_slots_claims_before_reset':db,'source120_build73_sql15_drift':d,'mutex':'held by caller','runner_sha256':sha(__file__),'guard_sha256':sha(R/'guard-a33.mjs'),'preload_sha256':sha(R/'suite-output-a33.mjs'),'disk_available_bytes':os.statvfs('/').f_bavail*os.statvfs('/').f_frsize});start=time.monotonic();timed=False
 with (R/(name+'.tap')).open('w') as tap,(R/(name+'.stderr')).open('w') as err:
  child=subprocess.Popen(cmd,cwd=cwd,env=os.environ,stdout=tap,stderr=err,start_new_session=True);ticks=Path('/proc/'+str(child.pid)+'/stat').read_text().split(') ')[1].split()[19];la={'utc':now(),'pid':child.pid,'startticks':ticks,'runner_pid':os.getpid()};write(name+'-launch.json',la);print('NATIVE_LAUNCHED '+name+' '+json.dumps(la),flush=True)
  try:code=child.wait(timeout=budget)
  except subprocess.TimeoutExpired:
   timed=True;write(name+'-timeout.json',{'utc':now(),'PG':snapshot(),'owned_nodes':nodes(),'last_tap':(R/(name+'.tap')).read_text().splitlines()[-25:]});os.killpg(child.pid,signal.SIGTERM)
   try:code=child.wait(timeout=8)
   except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait(timeout=8)
 text=(R/(name+'.tap')).read_text();post=snapshot();own=nodes();dbafter=status();x={'utc':now(),'native_exit':code,'timed_out':timed,'elapsed_seconds':time.monotonic()-start,**la,'PG':post,'DB_slots_claims_after_join':dbafter,'owned_nodes':own,'assertion_failure':'ERR_ASSERTION' in text,'failure_titles':[l.strip() for l in text.splitlines() if l.strip().startswith('not ok ')],'tap_sha256':sha(R/(name+'.tap')),'stderr_sha256':sha(R/(name+'.stderr'))};x['utc']=now();write(name+'-exit.json',x);assert post['quiescent'] and not own,(post,own);assert not timed,'timeout is not material assertion';candidate_check()
 for f in ['short-native-v2.json','short-native-v2-drain.json']:
  p=R/f
  if p.exists():p.rename(R/(name+'-'+f))
 print('NATIVE_JOINED '+name+' '+str(code)+' '+str(round(x['elapsed_seconds'],3)),flush=True);return x
if __name__=='__main__':
 inv=json.loads((R/'input-inventory-a33.json').read_text());lock=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 try:
  x=run('remaining-f09-five',inv['five_command'],P,inv['five_budget_seconds']);assert x['native_exit']==0;assert '# tests 5\n' in (R/'remaining-f09-five.tap').read_text();write('remaining-f09-terminal.json',{'utc':now(),'result':x,'runner_sha256':sha(__file__),'mutex':'released after receipt'})
 finally:fcntl.flock(lock,fcntl.LOCK_UN);lock.close()
