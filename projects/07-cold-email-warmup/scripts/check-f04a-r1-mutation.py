#!/usr/bin/env python3
"""Tail-prefix premature completion mutation; always restore both host and copied runtime input."""
import hashlib, os, subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
assert Path('/tmp/n7-f04a-heavy.allowed').is_file()
evidence=root/'docs/telemetry/features/20261002T232200Z-f04'
source=root/'src/replies/store.ts'; original=source.read_bytes()
mutant=original.replace(b"p.kind==='tail' && p.coveredThrough===tailHighWater",b"p.kind==='tail'",1)
assert mutant!=original
env={**os.environ,'COMPOSE_PROJECT_NAME':'n7f04a','N7_RUNTIME_DIR':'/tmp/n7-f04a-runtime','N7_WEB_PORT':'18705','N7_APP_ORIGIN':'http://127.0.0.1:18705','MAIL_PROVIDER_ALLOWLIST':'{"smtp.gmail.com":30,"imap.gmail.com":30}'}
def copy():
 subprocess.run(['docker','compose','-p','n7f04a','cp',str(source),'web:/app/src/replies/store.ts'],cwd=root,env=env,check=True,capture_output=True)
try:
 source.write_bytes(mutant);copy()
 r=subprocess.run(['docker','compose','-p','n7f04a','exec','-T','web','./node_modules/.bin/tsx','--test','tests/replies-integration.test.ts'],cwd=root,env=env,capture_output=True,text=True,timeout=90)
 (evidence/'sol-a-r1-mutation.txt').write_text(r.stdout+r.stderr+f'\nMutant exit: {r.returncode}\n')
 assert r.returncode!=0 and 'ERR_ASSERTION' in r.stdout and 'R1 P1 101 tail headers' in r.stdout
 print('RED: unconditional tail completion rejected by new 101-tail production-store assertion.')
finally:
 source.write_bytes(original);copy()
 r=subprocess.run(['docker','compose','-p','n7f04a','exec','-T','web','sha256sum','src/replies/store.ts'],cwd=root,env=env,capture_output=True,text=True,check=True)
 digest=hashlib.sha256(original).hexdigest();assert r.stdout.split()[0]==digest
 (evidence/'sol-a-r1-restored-source.txt').write_text(digest+' src/replies/store.ts (host=restored copied runtime input)\n')
