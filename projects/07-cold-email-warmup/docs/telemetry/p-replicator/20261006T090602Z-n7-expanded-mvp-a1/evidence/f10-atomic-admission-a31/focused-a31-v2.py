from pathlib import Path
import os,json,hashlib,subprocess,datetime,time,fcntl
R=Path('/tmp/n7-f10-atomic-admission-a31');P=Path('/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup');N='/tmp/n7-expanded-runtime-20261006/bin/node';now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat();sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(n,v):(R/n).write_text(json.dumps(v,indent=2)+'\n')
def nodes():
 out=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   if os.readlink(p/'exe').endswith('/node') and str(R).encode() in (p/'environ').read_bytes():out.append(int(p.name))
  except OSError:pass
 return out
assert os.environ['DATABASE_NAME']=='n7f10_a2';lock=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
try:
 assert not nodes();pre=json.loads(subprocess.check_output([N,str(R/'pg-snapshot-a31.mjs')],cwd=P,text=True));assert pre['quiescent'];
 commands={'typecheck':[N,'node_modules/typescript/bin/tsc','--noEmit'],'lint':[N,'node_modules/eslint/bin/eslint.js','src','tests'],'build':[N,'node_modules/typescript/bin/tsc','-p','tsconfig.build.json'],'unit':[N,'node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','tests/f10-runtime-unit.test.ts'],'pg':[N,'node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','--test-name-pattern=native poll claim reserves physical admission atomically','tests/f10-runtime-integration.test.ts']}
 write('focused-ready-v2.json',{'at':now(),'source_head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=P,text=True).strip(),'pre':pre,'commands':commands,'source':{str(p.relative_to(P)):sha(p) for p in [*(P/'src/runtime').glob('*.ts'),P/'src/mailboxes/transport-slots.ts',P/'src/replies/adapter.ts',*(P/'tests').glob('f10-runtime*.ts')]},'runner_sha':sha(__file__),'guard_sha':sha(R/'guard-a31.mjs')});results={}
 for name,cmd in {k:v for k,v in commands.items() if k in ['typecheck','lint','pg']}.items():
  with (R/(name+'-v2.log')).open('w') as log:
   child=subprocess.Popen(cmd,cwd=P,stdout=log,stderr=subprocess.STDOUT);start=time.monotonic();ticks=Path('/proc/'+str(child.pid)+'/stat').read_text().split(') ')[1].split()[19];code=child.wait(timeout=100);results[name]={'exit':code,'pid':child.pid,'startticks':ticks,'joined_utc':now(),'elapsed_seconds':time.monotonic()-start,'sha':sha(R/(name+'-v2.log'))};print(name,code,flush=True)
  if code:break
 post=json.loads(subprocess.check_output([N,str(R/'pg-snapshot-a31.mjs')],cwd=P,text=True));write('focused-results-v2.json',{'at':now(),'results':results,'post':post,'remaining_nodes':nodes()});assert post['quiescent'] and not nodes()
finally:fcntl.flock(lock,fcntl.LOCK_UN);lock.close()
