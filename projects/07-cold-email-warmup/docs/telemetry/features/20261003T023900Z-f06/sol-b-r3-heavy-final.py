import fcntl,subprocess,datetime,os,pathlib,json
root=pathlib.Path('/tmp/n7-f06b-r3/projects/07-cold-email-warmup'); trace=root/'docs/telemetry/features/20261003T023900Z-f06'; progress=pathlib.Path('/tmp/n7-f06b-r3-run/progress.md')
def event(s):
 with progress.open('a') as f:f.write(datetime.datetime.now(datetime.timezone.utc).isoformat()+' '+s+'\n')
def call(args,env=None):
 p=subprocess.run(args,cwd=root,env=env,capture_output=True,text=True)
 with (trace/'sol-b-r3-heavy.log').open('a') as f:f.write('Command: '+ ' '.join(args)+'\n'+p.stdout+p.stderr+'\nExit: '+str(p.returncode)+'\n')
 assert p.returncode==0, args
assert pathlib.Path('/tmp/n7-f06b-r3-heavy.allowed').exists()
lock=open('/tmp/codex-heavy-build.lock','a');event('heavy wait');fcntl.flock(lock,fcntl.LOCK_EX);event('heavy acquired')
env={**os.environ,'COMPOSE_PROJECT_NAME':'n7f06a','N7_RUNTIME_DIR':'/tmp/n7-f06a-runtime','N7_WEB_PORT':'18709','N7_APP_ORIGIN':'http://127.0.0.1:18709','N7_BILLING_MODE':'local_test','N7_POLL_MODE':'local_test','N7_DISPATCH_MODE':'local_test','MAIL_PROVIDER_ALLOWLIST':'{"smtp.gmail.com":30,"imap.gmail.com":30}','N7_F06_BINDING_PREFIX':'sol-b-r3-readable'}
try:
 assert __import__('shutil').disk_usage(root).free>1500*1024*1024
 call(['python3','scripts/check-f06b-r1-snapshot.py','freeze'],env)
 call(['docker','stop','n7f06a-web-1'])
 call(['bash','/tmp/n7-f06b-r3/scripts/check-port-conflicts.sh',str(root)],env)
 call(['docker','compose','build','--build-arg','BUILDKIT_STEP_LOG_MAX_SIZE=1048576','web'],env)
 call(['python3','scripts/check-f06b-r1-snapshot.py','preflight'],env)
 call(['docker','compose','up','-d','--no-deps','web'],env)
 call(['python3','scripts/check-f06b-r1-snapshot.py','receipt'],env)
finally:
 event('heavy released');fcntl.flock(lock,fcntl.LOCK_UN)
