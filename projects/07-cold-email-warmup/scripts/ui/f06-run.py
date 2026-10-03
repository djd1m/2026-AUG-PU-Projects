#!/usr/bin/env python3
"""Own network lifecycle, real UI mutex, safe stdin/stdout operator fixture RPC."""
import pathlib, subprocess, json, datetime, fcntl, sys, hashlib, time
ROOT=pathlib.Path(__file__).resolve().parents[2]
TRACE=ROOT/'docs/telemetry/features/20261003T023900Z-f06'
RUN=sys.argv[1] if len(sys.argv)>1 else 'attempt-1'
# Optional explicit new R1 receipt; the historical default remains exact.
binding=None
if len(sys.argv)>2:
 receipt_path=pathlib.Path(sys.argv[2]).resolve()
 assert receipt_path==TRACE/'sol-b-r1-image-receipt.json'
 binding=json.loads(receipt_path.read_text())
 assert binding['exact_source_and_build_files'] and binding['image_matches_container']
 assert binding['source_record']=='sol-b-r1-frozen-source.json'
EXPECTED_IMAGE=binding['image_id'] if binding else 'sha256:a65867e3f1af46b3f4d8a4894a002397ce4a84f890b22b6d0d10d44d1eaa2f7f'
EXPECTED_BUILD=binding['build_sha256'] if binding else '110c84753e81699007417bba0cd92e20288bbee938921657c58e33c183299ac6'
DEST=TRACE/('sol-b-'+RUN); DEST.mkdir(exist_ok=False)
REMOTE='/opt/browser/n7-f06b-20261003T023900Z-'+RUN
PROGRESS=pathlib.Path('/tmp/n7-f06b-resume-run/progress.md')
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def call(args, **kw): return subprocess.run(args,check=True,capture_output=True,**kw)
def event(kind,**kw):
 with (TRACE/('sol-b2-browser-events.jsonl' if binding else 'sol-b-events.jsonl')).open('a') as f: f.write(json.dumps({'at':now(),'event':kind,**kw})+'\n')
lock=open('/tmp/codex-ui-e2e.lock','a'); event('ui-lock-wait'); fcntl.flock(lock,fcntl.LOCK_EX)
PROGRESS.write_text('UI acquired: '+now()+'\n'); event('ui-lock-acquired')
added=False; child=None; result_code=1
try:
 ui=json.loads(call(['docker','inspect','codex-ui-playwright']).stdout)[0]
 if 'n7f06a_network' not in ui['NetworkSettings']['Networks']:
  call(['docker','network','connect','n7f06a_network','codex-ui-playwright']); added=True
 call(['docker','exec','codex-ui-playwright','mkdir','-p',REMOTE])
 for name in ['f06-browser.mjs','f06-journey.mjs','f06-security.mjs']:
  call(['docker','cp',str(ROOT/'scripts/ui'/name),'codex-ui-playwright:'+REMOTE+'/'+name])
 call(['docker','cp',str(ROOT/'scripts/ui/f06-fixture.mjs'),'n7f06a-web-1:/tmp/f06b-fixture.mjs'])
 source=json.loads((TRACE/(binding['source_record'] if binding else 'sol-b-source.json')).read_text()); mismatch=[]
 if binding:
  call(['python3',str(ROOT/'scripts/check-f06b-r1-snapshot.py'),'verify'])
  source['revision']=source['source_revision']
  assert source['source_sha256']==binding['source_sha256']
 for name,h in source['files'].items():
  if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=h: mismatch.append(name)
 assert not mismatch
 web,db=json.loads(call(['docker','inspect','n7f06a-web-1','n7f06a-db-1']).stdout)
 assert web['Image']==EXPECTED_IMAGE
 assert not any(db['NetworkSettings']['Ports'].values())
 scripts={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'scripts/ui').glob('f06-*') if p.is_file()}
 preflight={'status':'ready','at':now(),'source_revision':source['revision'],'source_sha256':source['source_sha256'],'source_files_matched':len(source['files']),'image_id':web['Image'],'build_sha256':EXPECTED_BUILD,'spec_sha256':json.loads((TRACE/'sol-b-run.json').read_text())['spec_sha256'],'scripts':scripts,'environment':{'cpu':2,'origin':'http://127.0.0.1:18709','web':'n7f06a-web-1','db_no_host_ports':True,'browser_container':'codex-ui-playwright','playwright':'1.63.0','ws':'ws://127.0.0.1:9320/'},'input_names':['N7_UI_EVIDENCE','SESSION_HMAC_KEY_FILE','CREDENTIAL_KEYRING_FILE','RECIPIENT_HASH_KEY_FILE','DATABASE_PASSWORD_FILE'],'command_as_data':['docker','exec','-i','-e','N7_UI_EVIDENCE='+REMOTE,'codex-ui-playwright','node',REMOTE+'/f06-browser.mjs'],'effects':['own TEST tenant UI mutations','trusted accepted local fixture poll/sink/provider','own network attach only if absent; detach in finally','own contexts/bridge/sockets close; shared browser server stays running'],'evidence_destination':str(DEST),'secrets':'operator and runtime values remain in web process; never browser/logs'}
 (DEST/'preflight.json').write_text(json.dumps(preflight,indent=2)+'\n')
 call(['docker','cp',str(DEST/'preflight.json'),'codex-ui-playwright:'+REMOTE+'/preflight.json'])
 event('READY-immediately-before-browser',attempt=RUN,script_sha256=scripts)
 child=subprocess.Popen(preflight['command_as_data'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1)
 for line in child.stdout:
  msg=json.loads(line)
  if msg.get('fixture'):
   answer=subprocess.run(['docker','exec','-i','n7f06a-web-1','node','/tmp/f06b-fixture.mjs'],input=json.dumps(msg['fixture']),capture_output=True,text=True,timeout=30)
   try: data=json.loads(answer.stdout)
   except Exception: data={'ok':False,'kind':'fixture_process_failure'}
   with (DEST/'fixtures.jsonl').open('a') as f: f.write(json.dumps({'at':now(),'input':msg['fixture'],'exit':answer.returncode,'output':data})+'\n')
   child.stdin.write(json.dumps(data)+'\n'); child.stdin.flush()
  else: print(json.dumps(msg),flush=True)
 result_code=child.wait(timeout=10)
finally:
 if child and child.poll() is None: child.terminate(); child.wait(timeout=10)
 subprocess.run(['docker','cp','codex-ui-playwright:'+REMOTE+'/.',str(DEST)],capture_output=True)
 if added: subprocess.run(['docker','network','disconnect','n7f06a_network','codex-ui-playwright'],capture_output=True)
 with PROGRESS.open('a') as f: f.write('UI released: '+now()+'; added network detached: '+str(added)+'\n')
 event('ui-lock-released',attempt=RUN,exit=result_code,own_attachment_detached=added)
 (DEST/'exit.json').write_text(json.dumps({'exit':result_code,'at':now(),'added_network':added})+'\n')
 fcntl.flock(lock,fcntl.LOCK_UN)
sys.exit(result_code)
