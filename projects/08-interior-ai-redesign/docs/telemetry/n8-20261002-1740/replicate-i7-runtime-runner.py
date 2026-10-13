from pathlib import Path
import subprocess,datetime,time,json,secrets,os,fcntl,hashlib
root=Path('/tmp/n8-replicate-i1');p=root/'projects/08-interior-ai-redesign';t=p/'docs/telemetry/n8-20261002-1740';run=Path('/tmp/n8-f07-i7-runtime');run.mkdir(mode=0o700,exist_ok=True);password=secrets.token_hex(32);env=run/'runtime.env';env.write_text('POSTGRES_PASSWORD='+password+'\nTEST_DATABASE_URL=postgresql://roomkind:'+password+'@db:5432/roomkind\nN8_TEST_DB_OWNERSHIP=n8-f07-replicate\n');env.chmod(0o600)
compose={'name':'n8f07i7','services':{'db':{'image':'postgres:16.10-bookworm','environment':{'POSTGRES_USER':'roomkind','POSTGRES_DB':'roomkind'},'env_file':[str(env)],'command':['postgres','-c','log_min_messages=fatal','-c','log_min_error_statement=panic'],'networks':['private'],'cpus':0.5,'mem_limit':'512m','healthcheck':{'test':['CMD-SHELL','pg_isready -U roomkind -d roomkind'],'interval':'2s','timeout':'2s','retries':30}},'tests':{'image':'n8-ui-e2e-6:8030270f','entrypoint':[],'working_dir':'/app','env_file':[str(env)],'networks':['private'],'cpus':1.5,'mem_limit':'1g','volumes':[str(p/n)+':/app/'+n+':ro' for n in ['web','db','scripts','tests','worker','package.json','package-lock.json']]}},'networks':{'private':{'internal':True}}};cf=run/'compose.json';cf.write_text(json.dumps(compose,indent=2)+'\n');(t/'replicate-i7-pg-compose.json').write_text(json.dumps(compose,indent=2)+'\n')
cmd=['docker','compose','-f',str(cf)];results=[];started=datetime.datetime.now(datetime.timezone.utc).isoformat();mono=time.monotonic();lock=open('/tmp/codex-heavy-build.lock','w');acquired=False

def call(name,args,timeout=60,project=False):
 s=time.monotonic()
 try:r=subprocess.run(args,cwd=p if project else root,capture_output=True,text=True,timeout=timeout if name=='cleanup' else min(timeout,max(1,900-int(time.monotonic()-mono))));code=r.returncode;output=r.stdout+r.stderr
 except subprocess.TimeoutExpired as e:code=124;output=((e.stdout or b'').decode() if isinstance(e.stdout,bytes) else (e.stdout or ''))+((e.stderr or b'').decode() if isinstance(e.stderr,bytes) else (e.stderr or ''))
 output=output.replace(password,'[REDACTED]');(t/('replicate-i7-pg-'+name+'.log')).write_text(output);results.append({'name':name,'exit_code':code,'elapsed_seconds':time.monotonic()-s,'log':'replicate-i7-pg-'+name+'.log'});print(json.dumps(results[-1]),flush=True);return code
try:
 deadline=time.monotonic()+90
 while True:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);acquired=True;break
  except BlockingIOError:
   if time.monotonic()>deadline:raise RuntimeError('heavy_mutex_timeout')
   time.sleep(1)
 print(json.dumps({'heavy_acquired_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}),flush=True)
 mem={line.split(':')[0]:int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines() if line.split()[1].isdigit()};assert mem['MemAvailable']>2000000
 source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();snap={'changed_product_tests_sha256':{str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for folder in ['web','db','scripts','tests','worker'] for f in (p/folder).rglob('*') if f.is_file() and '__pycache__' not in f.parts}}
 (t/'replicate-i7-source-snapshot.json').write_text(json.dumps({'source_revision':source,'files':snap['changed_product_tests_sha256']},indent=2)+'\n')
 matrix=json.loads(Path('/tmp/n8-i7-command-matrix.json').read_text());assert matrix['all']==45 and len(matrix['local'])==32 and len(matrix['pg'])==13
 image=subprocess.check_output(['docker','image','inspect','n8-ui-e2e-6:8030270f','--format','{{.Id}}'],text=True).strip()
 ready={'status':'ready','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_revision':source,'build_revision':image,'environment':'Node22.20/ownedPG16 CPU2 internal noports cachedimage readonlyfullsource; localPython host stdlib; separateprivategeneratedenv exists valuesexcluded','environment_available':env.exists(),'inputs':[{'name':'45 exact existing testfiles and readonlysourcehashes','available':True},{'name':'existingNode22anddependencies; ownedPGprivateenv','available':True}],'test_command':'python3 /tmp/n8-f07-i7-runtime.py; exact commandmatrix replicated in telemetry','expected_effects':['owned temporary schemas/testfiles/HTTPloopback only','no externalprovider calls/spend','remove own stack and privateenv finally'],'evidence_root':'docs/telemetry/n8-20261002-1740/replicate-i7-*','external_actions_executed':False,'e2e_claim':None}
 (t/'replicate-i7-preflight.json').write_text(json.dumps(ready,indent=2)+'\n')
 affinity=','.join(map(str,sorted(os.sched_getaffinity(0))[:2]))
 call('all-local32', ['taskset','-c',affinity,'/tmp/n8-node22','--test','--test-concurrency=1','--test-reporter=tap',*[str(p/x['file']) for x in matrix['local']]],240,project=True)
 call('python5',['taskset','-c',affinity,'python3','-m','unittest','discover','-s',str(p/'worker'),'-p','test_*.py'],60)
 call('lint',['taskset','-c',affinity,'/tmp/n8-node22',str(p/'scripts/check.js')],60,project=True)
 call('build',['taskset','-c',affinity,'/tmp/n8-node22',str(p/'scripts/check.js')],60,project=True)
 if call('port-preflight',['bash','scripts/check-port-conflicts.sh',str(cf)])!=0:raise RuntimeError('preflight_failed')
 if call('db-start',cmd+['up','-d','--wait','db'],90)!=0:raise RuntimeError('db_start_failed')
 expected=json.dumps(snap['changed_product_tests_sha256'],separators=(',',':'));binding="const fs=require('fs'),c=require('crypto');const m="+expected+";for(const [f,h]of Object.entries(m)){if(c.createHash('sha256').update(fs.readFileSync('/app/'+f)).digest('hex')!==h)process.exit(1)}if(process.versions.node.split('.')[0]!=='22')process.exit(2);console.log(JSON.stringify({node:process.version,files:Object.keys(m).length,matched:true}))"
 if call('binding',cmd+['run','--rm','--no-deps','tests','node','-e',binding])!=0:raise RuntimeError('binding_failed')
 for item in matrix['pg']:
  call(Path(item['file']).stem,cmd+['run','--rm','--no-deps','-e','N8_TEST_DB_OWNERSHIP='+item['ownership'],'tests','node','--test','--test-concurrency=1','--test-reporter=tap',item['file']],180)
 for kind in ['origin','owner','budget','fixture','payment','consent','partner','share-owner','share-hold']:
  call('mutation-'+kind,cmd+['run','--rm','--no-deps','-e','N8_TEST_DB_OWNERSHIP=n8-f02a','tests','node','scripts/mutation.js',kind],180)

except Exception as e:
 results.append({'name':'wrapper','exit_code':1,'safe_error':str(e) if str(e) in ['heavy_mutex_timeout','preflight_failed','db_start_failed','binding_failed'] else type(e).__name__})
finally:
 if acquired:call('cleanup',cmd+['down','-v','--remove-orphans'],45);fcntl.flock(lock,fcntl.LOCK_UN)
 env.unlink(missing_ok=True)
 finished=datetime.datetime.now(datetime.timezone.utc).isoformat();summary={'started_at':started,'finished_at':finished,'elapsed_seconds':time.monotonic()-mono,'source_revision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'image':'n8-ui-e2e-6:8030270f cached + exact readonlysourceoverlays','cpu_total':2,'published_ports':[],'results':results,'overall_exit':0 if all(x['exit_code']==0 for x in results) else 1};(t/'replicate-i7-pg-summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({'finished_at':finished,'overall_exit':summary['overall_exit'],'heavy_released':acquired}),flush=True)
