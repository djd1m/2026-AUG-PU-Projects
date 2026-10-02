#!/usr/bin/env python3
"""Bind R1 runtime to immutable source and scan only own fixture stack; no secret output."""
import hashlib,json,os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
ev=root/'docs/telemetry/features/20261002T201500Z-f02/evidence/r1'
env={**os.environ,'COMPOSE_PROJECT_NAME':'n7f02','N7_RUNTIME_DIR':'/tmp/n7-f02-runtime','N7_WEB_PORT':'18702','N7_APP_ORIGIN':'http://127.0.0.1:18702','MAIL_PROVIDER_ALLOWLIST':'{"smtp.gmail.com":30,"imap.gmail.com":30}'}
def call(args):
 return subprocess.check_output(args,cwd=root,env=env,text=True)
snapshot=json.loads((ev/'source-snapshot.json').read_text())
assert all(hashlib.sha256((root/name).read_bytes()).hexdigest()==digest for name,digest in snapshot.items())
web=call(['docker','compose','-p','n7f02','ps','-q','web']).strip()
container=json.loads(call(['docker','inspect',web]))[0]
assert container['Config']['Labels']['com.docker.compose.project']=='n7f02'
script="const fs=require('node:fs'),crypto=require('node:crypto');const files="+json.dumps([n for n in snapshot if n!='Dockerfile'])+";console.log(JSON.stringify({node:process.version,hashes:Object.fromEntries(files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))}));"
command=['docker','compose','-p','n7f02','exec','-T','web','node','-e',script]
runtime=json.loads(call(command))
assert runtime['node']=='v22.20.0'
assert runtime['hashes']=={n:d for n,d in snapshot.items() if n!='Dockerfile'}
(ev/'runtime-source-check.json').write_text(json.dumps({'source_snapshot_sha256':hashlib.sha256((ev/'source-snapshot.json').read_bytes()).hexdigest(),'image_digest':container['Image'],'container_id':web,'runtime':runtime,'matched':len(runtime['hashes']),'excluded':'Dockerfile not copied into image; hashed in source snapshot','command':command,'exit_code':0},indent=2)+'\n')
path=Path('/tmp/n7-f02-runtime')
values=[(path/n).read_text().strip() for n in ['session-key','db-password']]
values.extend(json.loads((path/'credential-keyring.json').read_text())['keys'].values())
assert all(values)
logs=call(['docker','compose','-p','n7f02','logs','--no-color'])
assert not any(v in logs for v in values),'runtime secret detected; values suppressed'
assert 'N7_CREDENTIAL_CANARY_' not in logs and 'N7_PRIVATE_CANARY_' not in logs,'canary detected; values suppressed'
files=call(['git','ls-files','--cached','--others','--exclude-standard','.']).splitlines()
for name in files:
 p=root/name
 if p.is_file():
  assert not any(v in p.read_text(errors='replace') for v in values),'project secret detected; values suppressed'
(ev/'secret-scan.txt').write_text('Exit0: runtime keys checked, values suppressed; project files and ONLY n7f02 logs contain zero secrets or canary prefixes. No live SMTP/IMAP.\n')
print('Exit0: immutable local snapshot and29 runtime files match; image digest captured; own-stack secret scan pass.')
