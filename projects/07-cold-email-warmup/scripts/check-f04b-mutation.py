#!/usr/bin/env python3
"""Public forged-capability guard mutation; always restore both host and copied runtime input."""
import hashlib, os, subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
assert Path('/tmp/n7-f04b-heavy.allowed').is_file()
evidence=root/'docs/telemetry/features/20261002T232200Z-f04'
source=root/'src/suppression/store.ts'; original=source.read_bytes()
mutant=original.replace(b"if(!r) throw new HttpError(400,'invalid_capability');return r;",b"if(!r) return {tenant_id:'00000000-0000-4000-8000-000000000001'};return r;",1)
assert mutant!=original
env={**os.environ,'COMPOSE_PROJECT_NAME':'n7f04b','N7_RUNTIME_DIR':'/tmp/n7-f04b-runtime','N7_WEB_PORT':'18706','N7_APP_ORIGIN':'http://127.0.0.1:18706','MAIL_PROVIDER_ALLOWLIST':'{"smtp.gmail.com":30,"imap.gmail.com":30}'}
def copy():
 subprocess.run(['docker','compose','-p','n7f04b','cp',str(source),'web:/app/src/suppression/store.ts'],cwd=root,env=env,check=True,capture_output=True)
try:
 source.write_bytes(mutant);copy()
 r=subprocess.run(['docker','compose','-p','n7f04b','exec','-T','web','./node_modules/.bin/tsx','--test','tests/suppression-integration.test.ts'],cwd=root,env=env,capture_output=True,text=True,timeout=90)
 (evidence/'sol-b-mutation.txt').write_text(r.stdout+r.stderr+f'\nMutant exit: {r.returncode}\n')
 assert r.returncode!=0 and 'ERR_ASSERTION' in r.stdout and 'B1/B4 generic accessible GET' in r.stdout
 print('RED: forged-token GET capability bypass rejected by public HTTP zero-write guard.')
finally:
 source.write_bytes(original);copy()
 r=subprocess.run(['docker','compose','-p','n7f04b','exec','-T','web','sha256sum','src/suppression/store.ts'],cwd=root,env=env,capture_output=True,text=True,check=True)
 digest=hashlib.sha256(original).hexdigest();assert r.stdout.split()[0]==digest
 (evidence/'sol-b-restored-source.txt').write_text(digest+' src/suppression/store.ts (host=restored copied runtime input)\n')
