#!/usr/bin/env python3
"""Own source-bound diagnostic with actual UI flock and read-only READY."""
import pathlib,json,hashlib,subprocess,datetime,fcntl,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[2]
TRACE=ROOT/'docs/telemetry/features/20261003T023900Z-f06'
DEST=TRACE/'sol-b-b2-unsubscribe-probe-1';DEST.mkdir(exist_ok=False)
REMOTE='/opt/browser/n7-f06b-20261003T023900Z-b2-unsubscribe-probe-1'
PROGRESS=pathlib.Path('/tmp/n7-f06b-resume-run/progress.md')
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def call(args,**kw):return subprocess.run(args,check=True,capture_output=True,**kw)
def effects(tenant):
 data=call(['docker','exec','-i','n7f06a-web-1','node','/tmp/f06b-fixture.mjs'],input=json.dumps({'action':'effects','tenant':tenant}),text=True)
 return json.loads(data.stdout)
fixture=json.loads((TRACE/'sol-b-b2-attempt-1/fixtures.jsonl').read_text().splitlines()[-1]);tenant=fixture['input']['tenant']
messages=json.loads((TRACE/'sol-b-b2-attempt-1/1-local-messages.json').read_text())['messages']
url=next(m for m in messages if m['recipient']=='unsub-f06b@example.test')['headers']['List-Unsubscribe'][1:-1]
lock=open('/tmp/codex-ui-e2e.lock','a');fcntl.flock(lock,fcntl.LOCK_EX);added=False
with PROGRESS.open('a') as f:f.write('Probe UI acquired: '+now()+'\n')
try:
 call(['python3',str(ROOT/'scripts/check-f06b-r1-snapshot.py'),'verify'])
 binding=json.loads((TRACE/'sol-b-r1-image-receipt.json').read_text());source=json.loads((TRACE/'sol-b-r1-frozen-source.json').read_text())
 web,db,ui=json.loads(call(['docker','inspect','n7f06a-web-1','n7f06a-db-1','codex-ui-playwright']).stdout)
 assert web['Image']==binding['image_id'] and web['State']['Running'] and not any(db['NetworkSettings']['Ports'].values())
 for name in ['session-key','db-password','recipient-hash-key','operator-token','credential-keyring.json']:assert (pathlib.Path('/tmp/n7-f06a-runtime')/name).stat().st_size>0
 assert urllib.request.urlopen('http://127.0.0.1:18709/readyz').status==200
 if 'n7f06a_network' not in ui['NetworkSettings']['Networks']:call(['docker','network','connect','n7f06a_network','codex-ui-playwright']);added=True
 call(['docker','exec','codex-ui-playwright','mkdir','-p',REMOTE]);call(['docker','cp',str(ROOT/'scripts/ui/f06-unsubscribe-probe.mjs'),'codex-ui-playwright:'+REMOTE+'/probe.mjs'])
 (DEST/'effects-before.json').write_text(json.dumps(effects(tenant),indent=2)+'\n')
 cmd=['docker','exec','-e','N7_UI_EVIDENCE='+REMOTE,'codex-ui-playwright','node',REMOTE+'/probe.mjs']
 ready={'at':now(),'status':'ready','source_sha256':binding['source_sha256'],'source_files_matched':len(source['files']),'build_sha256':binding['build_sha256'],'image_id':web['Image'],'origin':'http://127.0.0.1:18709','public_test_url':url,'scripts':{n:hashlib.sha256((ROOT/'scripts/ui'/n).read_bytes()).hexdigest() for n in ['f06-unsubscribe-probe.mjs','f06-unsubscribe-probe.py']},'environment':'own running web CPU2/privatePG; shared Playwright1.63.0 Chromium390','input_names':['public TEST token','existing external runtime files; presence only'],'command_as_data':cmd,'effects':['actual TEST unsubscribe form POST; no browser operator credential','own network and browser context cleanup'],'evidence_destination':str(DEST),'external_actions_executed':False,'e2e_claim':None}
 (DEST/'preflight.json').write_text(json.dumps(ready,indent=2)+'\n');call(['docker','cp',str(DEST/'preflight.json'),'codex-ui-playwright:'+REMOTE+'/preflight.json'])
 result=call(cmd,text=True,timeout=60);print(result.stdout.strip());(DEST/'exit.json').write_text(json.dumps({'exit':result.returncode,'at':now()})+'\n')
 (DEST/'effects-after.json').write_text(json.dumps(effects(tenant),indent=2)+'\n')
finally:
 subprocess.run(['docker','cp','codex-ui-playwright:'+REMOTE+'/.',str(DEST)],capture_output=True)
 if added:subprocess.run(['docker','network','disconnect','n7f06a_network','codex-ui-playwright'],capture_output=True)
 with PROGRESS.open('a') as f:f.write('Probe UI released: '+now()+'; own attachment detached: '+str(added)+'\n')
 fcntl.flock(lock,fcntl.LOCK_UN)
