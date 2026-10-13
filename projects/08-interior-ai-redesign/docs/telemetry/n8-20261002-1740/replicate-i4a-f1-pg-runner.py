from pathlib import Path
import subprocess,datetime,time,json,secrets,os,fcntl,hashlib
root=Path('/tmp/n8-replicate-i1');p=root/'projects/08-interior-ai-redesign';t=p/'docs/telemetry/n8-20261002-1740';run=Path('/tmp/n8-f07-i4a-f1-runtime');run.mkdir(mode=0o700,exist_ok=True);password=secrets.token_hex(32);env=run/'runtime.env';env.write_text('POSTGRES_PASSWORD='+password+'\nTEST_DATABASE_URL=postgresql://roomkind:'+password+'@db:5432/roomkind\nN8_TEST_DB_OWNERSHIP=n8-f07-replicate\n');env.chmod(0o600)
compose={'name':'n8f07i4af1','services':{'db':{'image':'postgres:16.10-bookworm','environment':{'POSTGRES_USER':'roomkind','POSTGRES_DB':'roomkind'},'env_file':[str(env)],'command':['postgres','-c','log_min_messages=fatal','-c','log_min_error_statement=panic'],'networks':['private'],'cpus':0.5,'mem_limit':'512m','healthcheck':{'test':['CMD-SHELL','pg_isready -U roomkind -d roomkind'],'interval':'2s','timeout':'2s','retries':30}},'tests':{'image':'n8-ui-e2e-6:8030270f','entrypoint':[],'working_dir':'/app','env_file':[str(env)],'networks':['private'],'cpus':1.5,'mem_limit':'1g','volumes':[str(p/n)+':/app/'+n+':ro' for n in ['web','db','scripts','tests','package.json','package-lock.json']]}},'networks':{'private':{'internal':True}}};cf=run/'compose.json';cf.write_text(json.dumps(compose,indent=2)+'\n');(t/'replicate-i4a-f1-pg-compose.json').write_text(json.dumps(compose,indent=2)+'\n')
cmd=['docker','compose','-f',str(cf)];results=[];started=datetime.datetime.now(datetime.timezone.utc).isoformat();mono=time.monotonic();lock=open('/tmp/codex-heavy-build.lock','w');acquired=False

def call(name,args,timeout=60):
 s=time.monotonic()
 try:r=subprocess.run(args,cwd=root,capture_output=True,text=True,timeout=timeout);code=r.returncode;output=r.stdout+r.stderr
 except subprocess.TimeoutExpired as e:code=124;output=((e.stdout or b'').decode() if isinstance(e.stdout,bytes) else (e.stdout or ''))+((e.stderr or b'').decode() if isinstance(e.stderr,bytes) else (e.stderr or ''))
 output=output.replace(password,'[REDACTED]');(t/('replicate-i4a-f1-pg-'+name+'.log')).write_text(output);results.append({'name':name,'exit_code':code,'elapsed_seconds':time.monotonic()-s,'log':'replicate-i4a-f1-pg-'+name+'.log'});print(json.dumps(results[-1]),flush=True);return code
try:
 deadline=time.monotonic()+90
 while True:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);acquired=True;break
  except BlockingIOError:
   if time.monotonic()>deadline:raise RuntimeError('heavy_mutex_timeout')
   time.sleep(1)
 print(json.dumps({'heavy_acquired_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}),flush=True)
 mem={line.split(':')[0]:int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines() if line.split()[1].isdigit()};assert mem['MemAvailable']>2000000
 source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();snap=json.loads((t/'replicate-i4a-f1-snapshot.json').read_text());snap['changed_product_tests_sha256']={a['path']:a['sha256'] for a in snap['product_test_files']};assert all(hashlib.sha256((p/n).read_bytes()).hexdigest()==h for n,h in snap['changed_product_tests_sha256'].items())
 if call('port-preflight',['bash','scripts/check-port-conflicts.sh',str(cf)])!=0:raise RuntimeError('preflight_failed')
 if call('db-start',cmd+['up','-d','--wait','db'],90)!=0:raise RuntimeError('db_start_failed')
 expected=json.dumps(snap['changed_product_tests_sha256'],separators=(',',':'));binding="const fs=require('fs'),c=require('crypto');const m="+expected+";for(const [f,h]of Object.entries(m)){if(c.createHash('sha256').update(fs.readFileSync('/app/'+f)).digest('hex')!==h)process.exit(1)}if(process.versions.node.split('.')[0]!=='22')process.exit(2);console.log(JSON.stringify({node:process.version,files:Object.keys(m).length,matched:true}))"
 if call('binding',cmd+['run','--rm','--no-deps','tests','node','-e',binding])!=0:raise RuntimeError('binding_failed')
 baseline=call('baseline-red',cmd+['run','--rm','--no-deps','-v',str(run/'baseline-jobs.js')+':/app/web/jobs.js:ro','-v',str(run/'baseline-provider-submissions.js')+':/app/web/provider-submissions.js:ro','tests','node','tests/replicate-lifecycle.integration.test.js'],180)
 baseline_log=(t/'replicate-i4a-f1-pg-baseline-red.log').read_text()
 expected_red=baseline==1 and 'not ok 3 - late identity after lease loss stays cleanup-only before claim, with or without maintenance' in baseline_log and 'submission_fence_expired' in baseline_log
 results[-1]['expected_exit_code']=1;results[-1]['expected_semantic_failure']=expected_red
 (t/'replicate-i4a-f1-pg-baseline-map.json').write_text((run/'baseline-map.json').read_text())
 call('lifecycle-pg16',cmd+['run','--rm','--no-deps','tests','node','tests/replicate-lifecycle.integration.test.js'],180)
 call('i1-pg16',cmd+['run','--rm','--no-deps','tests','node','tests/replicate.integration.test.js'],180)
 call('jobs-pg16',cmd+['run','--rm','--no-deps','-e','N8_TEST_DB_OWNERSHIP=n8-f02a','tests','node','tests/jobs.integration.test.js'],180)
except Exception as e:
 results.append({'name':'wrapper','exit_code':1,'safe_error':str(e) if str(e) in ['heavy_mutex_timeout','preflight_failed','db_start_failed','binding_failed'] else type(e).__name__})
finally:
 if acquired:call('cleanup',cmd+['down','-v','--remove-orphans'],45);fcntl.flock(lock,fcntl.LOCK_UN)
 env.unlink(missing_ok=True)
 finished=datetime.datetime.now(datetime.timezone.utc).isoformat();summary={'started_at':started,'finished_at':finished,'elapsed_seconds':time.monotonic()-mono,'source_revision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'image':'n8-ui-e2e-6:8030270f cached + exact readonlysourceoverlays','cpu_total':2,'published_ports':[],'results':results,'overall_exit':0 if all((x.get('expected_semantic_failure',False) if x['name']=='baseline-red' else x['exit_code']==0) for x in results) else 1};(t/'replicate-i4a-f1-pg-summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({'finished_at':finished,'overall_exit':summary['overall_exit'],'heavy_released':acquired}),flush=True)
