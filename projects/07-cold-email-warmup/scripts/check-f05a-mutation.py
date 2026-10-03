#!/usr/bin/env python3
"""Remove current canonical fence; real stale-fetch assertions must reject it."""
import hashlib,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
evidence=root/'docs/telemetry/features/20261003T010600Z-f05'
source=root/'src/billing/service.ts';original=source.read_bytes()
old=b'if(!current || current.version!==canonical.version || current.status!==canonical.status || !current.available)'
mutant=original.replace(old,b'if(!current)',1);assert mutant!=original
run=lambda args:subprocess.run(['docker','compose','-p','n7f05a',*args],cwd=root,capture_output=True,text=True,check=True).stdout
try:
 source.write_bytes(mutant);run(['cp',str(source),'web:/app/src/billing/service.ts'])
 r=subprocess.run(['docker','compose','-p','n7f05a','exec','-T','web','npm','run','test:f05a'],cwd=root,capture_output=True,text=True,timeout=80)
 (evidence/'sol-a-mutation.txt').write_text(r.stdout+r.stderr+f'\nMutant exit: {r.returncode}\n')
 assert r.returncode!=0 and 'ERR_ASSERTION' in r.stdout,'guard mutation did not fail a real assertion'
 print('RED canonical fence: stale fetch assertion failed, exit',r.returncode)
finally:
 source.write_bytes(original);run(['cp',str(source),'web:/app/src/billing/service.ts'])
 assert run(['exec','-T','web','sha256sum','src/billing/service.ts']).split()[0]==hashlib.sha256(original).hexdigest()
 (evidence/'sol-a-restored.txt').write_text(hashlib.sha256(original).hexdigest()+' src/billing/service.ts restored host/container\n')
