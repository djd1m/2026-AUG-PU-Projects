#!/usr/bin/env python3
"""Relay two reused stdin/stdout processes; coordinator owns image/container lifecycle.
No container start, build, network attach, provider request or DB reset occurs here.
"""
import argparse, re, datetime, fcntl, hashlib, json, pathlib, selectors, shutil, subprocess, sys, time
parser=argparse.ArgumentParser()
for name in ('source-revision','image','environment','evidence','fixture-container','fixture-script','preflight'):
 parser.add_argument('--'+name,required=True)
a=parser.parse_args()
def call(argv): return subprocess.run(argv,check=True,capture_output=True,text=True,timeout=20)
def read_line(process,timeout=15):
 selector=selectors.DefaultSelector()
 try:
  selector.register(process.stdout,selectors.EVENT_READ)
  if not selector.select(timeout): raise TimeoutError('bounded RPC/process wait')
  line=process.stdout.readline()
  if not line: raise RuntimeError('process closed before receipt')
  return json.loads(line)
 finally: selector.close()
source=pathlib.Path(__file__).resolve().parent
preflight=json.loads(pathlib.Path(a.preflight).read_text()); environment=json.loads(pathlib.Path(a.environment).read_text())
assert preflight['status']=='ready' and preflight['source_revision']==a.source_revision
assert preflight['image_id']==a.image and preflight['environment']==environment
assert preflight['origin']=='https://n7-ui.example.test' and preflight['production_tls_proof'] is False
assert preflight['fixture_host']==a.fixture_container and preflight['fixture_port']==3000
assert re.fullmatch(r'n7_live_ui_a[1-9][0-9]*_20261007',preflight['database_name'])
assert preflight['evidence_destination']==str(pathlib.Path(a.evidence).resolve())
assert environment['browser_container']=='codex-ui-playwright'
assert environment['fixture_container']==a.fixture_container
assert environment['database_container']=='n7-live-business-testpg-20261007'
assert environment['database_network']=='n7f06a_network' and environment['browser_network']=='codex-ui-browser'
assert a.fixture_container.startswith('n7-live-ui-') and a.fixture_script.startswith('/app/')
assert shutil.disk_usage('/tmp').free>=2*1024**3
for name in ('live-billing-fixture.mjs','live-billing-browser.mjs','live-billing-run.py'):
 assert hashlib.sha256((source/name).read_bytes()).hexdigest()==preflight['scripts'][name]
fixture,db,browser=json.loads(call(['docker','inspect',a.fixture_container,environment['database_container'],'codex-ui-playwright']).stdout)
assert fixture['Image']==a.image and fixture['Config']['User'] in ('node','1000','1000:1000')
assert all(not any(c['NetworkSettings']['Ports'].values()) for c in (fixture,db))
assert set(fixture['NetworkSettings']['Networks'])=={'codex-ui-browser','n7f06a_network'}
assert 'codex-ui-browser' in browser['NetworkSettings']['Networks']
dest=pathlib.Path(a.evidence).resolve();dest.mkdir(exist_ok=False)
remote='/opt/browser/'+dest.name
assert dest.name.startswith('n7-live-ui-')
(dest/'preflight.json').write_text(json.dumps(preflight,indent=2)+'\n')
lock=open('/tmp/codex-ui-e2e.lock','a'); fcntl.flock(lock,fcntl.LOCK_EX)
fixture_process=browser_process=None; exit_code=1
try:
 call(['docker','exec','codex-ui-playwright','mkdir',remote])
 call(['docker','cp',str(source/'live-billing-browser.mjs'),'codex-ui-playwright:'+remote+'/live-billing-browser.mjs'])
 call(['docker','cp',str(dest/'preflight.json'),'codex-ui-playwright:'+remote+'/preflight.json'])
 fixture_process=subprocess.Popen(['docker','exec','-i',a.fixture_container,'node',a.fixture_script],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1)
 assert read_line(fixture_process).get('ready') is True
 browser_process=subprocess.Popen(['docker','exec','-i','-e','N7_UI_EVIDENCE='+remote,'codex-ui-playwright','node',remote+'/live-billing-browser.mjs'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1)
 deadline=time.monotonic()+240
 while browser_process.poll() is None:
  message=read_line(browser_process,min(40,max(1,deadline-time.monotonic())))
  if time.monotonic()>deadline: raise TimeoutError('bounded four minute browser attempt')
  if 'fixture' in message:
   action=message['fixture'];fixture_process.stdin.write(json.dumps(action)+'\n');fixture_process.stdin.flush();answer=read_line(fixture_process)
   # Safe receipt only: never record credential/key/header or arbitrary fixture values.
   with (dest/'fixtures.jsonl').open('a') as out:out.write(json.dumps({'action':action['action'],'ok':answer.get('ok')})+'\n')
   browser_process.stdin.write(json.dumps(answer)+'\n');browser_process.stdin.flush()
  else:
   print(json.dumps(message),flush=True)
   if 'status' in message:break
 exit_code=browser_process.wait(timeout=10)
finally:
 for process in (browser_process,fixture_process):
  if process and process.poll() is None:
   if process.stdin:process.stdin.close()
   try:process.wait(timeout=10)
   except subprocess.TimeoutExpired:process.terminate();process.wait(timeout=10)
 if browser_process:subprocess.run(['docker','cp','codex-ui-playwright:'+remote+'/.',str(dest)],capture_output=True,timeout=20)
 (dest/'exit.json').write_text(json.dumps({'exit':exit_code,'finished_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'containers_started':False,'networks_modified':False,'shared_browser_preserved':True})+'\n')
 fcntl.flock(lock,fcntl.LOCK_UN);lock.close()
sys.exit(exit_code)
