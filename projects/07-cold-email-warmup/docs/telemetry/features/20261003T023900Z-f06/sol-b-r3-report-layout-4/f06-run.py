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
 assert receipt_path in [TRACE/'sol-b-r1-image-receipt.json',TRACE/'sol-b-r2-image-receipt.json',TRACE/'sol-b-r3-image-receipt.json',TRACE/'sol-b-r3-readable-image-receipt.json']
 prefix=receipt_path.name.removesuffix('-image-receipt.json')
 binding=json.loads(receipt_path.read_text())
 assert binding['exact_source_and_build_files'] and binding['image_matches_container']
 assert binding['source_record']==prefix+'-frozen-source.json'
EXPECTED_IMAGE=binding['image_id'] if binding else 'sha256:a65867e3f1af46b3f4d8a4894a002397ce4a84f890b22b6d0d10d44d1eaa2f7f'
EXPECTED_BUILD=binding['build_sha256'] if binding else '110c84753e81699007417bba0cd92e20288bbee938921657c58e33c183299ac6'
DEST=TRACE/('sol-b-'+RUN); DEST.mkdir(exist_ok=False)
REMOTE='/opt/browser/n7-f06b-20261003T023900Z-'+RUN
B3=RUN.startswith('b3-')
PROGRESS=pathlib.Path('/tmp/n7-f06b-r3-run/progress.md') if binding and prefix.startswith('sol-b-r3') else pathlib.Path('/tmp/n7-f06b-final-run/progress.md') if B3 else pathlib.Path('/tmp/n7-f06b-r2-run/progress.md' if binding and prefix=='sol-b-r2' else '/tmp/n7-f06b-resume-run/progress.md')
PROGRESS.parent.mkdir(exist_ok=True)
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def call(args, **kw): return subprocess.run(args,check=True,capture_output=True,**kw)
def event(kind,**kw):
 with (TRACE/('sol-b-r3-browser-events.jsonl' if binding and prefix.startswith('sol-b-r3') else 'sol-b3-browser-events.jsonl' if B3 else 'sol-b-r2-browser-events.jsonl' if binding and prefix=='sol-b-r2' else ('sol-b2-browser-events.jsonl' if binding else 'sol-b-events.jsonl'))).open('a') as f: f.write(json.dumps({'at':now(),'event':kind,**kw})+'\n')
lock=open('/tmp/codex-ui-e2e.lock','a'); event('ui-lock-wait'); fcntl.flock(lock,fcntl.LOCK_EX)
with PROGRESS.open('a') as f:f.write('UI acquired: '+now()+'\n')
event('ui-lock-acquired')
added=False; child=None; result_code=1
try:
 ui=json.loads(call(['docker','inspect','codex-ui-playwright']).stdout)[0]
 if 'n7f06a_network' not in ui['NetworkSettings']['Networks']:
  call(['docker','network','connect','n7f06a_network','codex-ui-playwright']); added=True
 call(['docker','exec','codex-ui-playwright','mkdir','-p',REMOTE])
 correction=RUN in ['r2-unsubscribe-probe-1','r2-unsubscribe-probe-2']
 assert not correction or binding and prefix=='sol-b-r2'
 for p in (ROOT/'scripts/ui').glob('f06-*'):
  if p.is_file(): (DEST/p.name).write_bytes(p.read_bytes())
 for name in (['f06-report-layout.mjs'] if RUN.startswith('r3-report-layout') else ['f06-unsubscribe-probe.mjs'] if correction else ['f06-browser.mjs','f06-journey.mjs','f06-security.mjs','f06-b3-focused.mjs','f06-b3-extra.mjs','f06-b3-login.mjs']):
  call(['docker','cp',str(ROOT/'scripts/ui'/name),'codex-ui-playwright:'+REMOTE+'/'+name])
 call(['docker','cp',str(ROOT/'scripts/ui/f06-fixture.mjs'),'n7f06a-web-1:/tmp/f06b-fixture.mjs'])
 fixture_input=None;public_urls=None
 if correction:
  def operator(value):
   answer=call(['docker','exec','-i','n7f06a-web-1','node','/tmp/f06b-fixture.mjs'],input=json.dumps(value),text=True,timeout=35)
   data=json.loads(answer.stdout);assert data['ok']
   with (DEST/'fixtures.jsonl').open('a') as f:f.write(json.dumps({'at':now(),'input':value,'exit':answer.returncode,'output':({'ok':data.get('ok'),'credentials':'suppressed'} if msg['fixture'].get('action')=='auth-seed' else data)})+'\n')
   return data['result']
  fixture_input=operator({'action':'unsubscribe-setup'})
  sent=operator({'action':'send',**fixture_input});assert len(sent['messages'])==3
  (DEST/'local-messages.json').write_text(json.dumps(sent,indent=2)+'\n')
  public_urls=[next(m for m in sent['messages'] if m['recipient']==name+'-f06b@example.test')['headers']['List-Unsubscribe'][1:-1] for name in ['desktop','mobile']]
 source=json.loads((TRACE/(binding['source_record'] if binding else 'sol-b-source.json')).read_text()); mismatch=[]
 if binding:
  call(['env','N7_F06_BINDING_PREFIX='+prefix,'python3',str(ROOT/'scripts/check-f06b-r1-snapshot.py'),'verify'])
  source['revision']=source['source_revision']
  assert source['source_sha256']==binding['source_sha256']
 for name,h in source['files'].items():
  if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=h: mismatch.append(name)
 assert not mismatch
 web,db=json.loads(call(['docker','inspect','n7f06a-web-1','n7f06a-db-1']).stdout)
 assert web['Image']==EXPECTED_IMAGE
 assert not any(db['NetworkSettings']['Ports'].values())
 scripts={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in DEST.glob('f06-*') if p.is_file()}
 assert all(hashlib.sha256((ROOT/'scripts/ui'/n).read_bytes()).hexdigest()==v for n,v in scripts.items())
 preflight={'focused_resume':RUN.startswith('b3-focused') and RUN!='b3-focused-1','target_tenants':json.loads((TRACE/'sol-b3-extra-input.json').read_text())['target_tenants'] if RUN.startswith('b3-extra') else [],'seed_auth':RUN.startswith('b3-true-login') or RUN.startswith('b3-extra') or RUN.startswith('b3-focused') or RUN.startswith('b3-crossbrowser'),'group':'true-login' if RUN.startswith('b3-true-login') else 'extra' if RUN.startswith('b3-extra') else 'focused' if RUN.startswith('b3-focused') else 'crossbrowser' if RUN.startswith('b3-crossbrowser') else 'remaining' if RUN=='b3-remaining-1' else 'full','status':'ready','at':now(),'source_revision':source['revision'],'source_sha256':source['source_sha256'],'source_files_matched':len(source['files']),'image_id':web['Image'],'build_sha256':EXPECTED_BUILD,'spec_sha256':json.loads((TRACE/'sol-b-run.json').read_text())['spec_sha256'],'scripts':scripts,'environment':{'cpu':2,'origin':'http://127.0.0.1:18709','web':'n7f06a-web-1','db_no_host_ports':True,'browser_container':'codex-ui-playwright','playwright':'1.63.0','ws':'ws://127.0.0.1:9320/'},'input_names':['N7_UI_EVIDENCE','SESSION_HMAC_KEY_FILE','CREDENTIAL_KEYRING_FILE','RECIPIENT_HASH_KEY_FILE','DATABASE_PASSWORD_FILE'],'command_as_data':['docker','exec','-i','-e','N7_UI_EVIDENCE='+REMOTE,'codex-ui-playwright','node',REMOTE+'/f06-browser.mjs'],'effects':['own TEST tenant UI mutations','trusted accepted local fixture poll/sink/provider','own network attach only if absent; detach in finally','own contexts/bridge/sockets close; shared browser server stays running'],'evidence_destination':str(DEST),'external_actions_executed':False,'environment_available':True,'e2e_claim':None,'secrets':'operator and runtime values remain in web process; never browser/logs'}
 if RUN.startswith('r3-report-layout'):
  assert binding and prefix.startswith('sol-b-r3')
  preflight['command_as_data'][-1]=REMOTE+'/f06-report-layout.mjs'
  preflight['seed_auth']=True
 if correction:
  preflight.update(origin='http://127.0.0.1:18709',public_urls=public_urls,fixture_input=fixture_input)
  preflight['command_as_data'][-1]=REMOTE+'/f06-unsubscribe-probe.mjs'
  preflight['effects']=['GET/denied POST zero business effects; actual native unsubscribe and repeat at1440/390','operator fixture outside browser; accepted PollWorker/DispatchStore/SubmissionStore real TEST messages','own contexts/bridge/sockets/network cleanup; shared browser preserved']
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
   with (DEST/'fixtures.jsonl').open('a') as f: f.write(json.dumps({'at':now(),'input':msg['fixture'],'exit':answer.returncode,'output':({'ok':data.get('ok'),'credentials':'suppressed'} if msg['fixture'].get('action')=='auth-seed' else data)})+'\n')
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
