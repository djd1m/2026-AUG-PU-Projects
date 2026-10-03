#!/usr/bin/env python3
"""Remove the share eligibility guard; stale/incomparable HTTP must fail a real assertion."""
import hashlib,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
evidence=root/'docs/telemetry/features/20261003T010600Z-f05'
source=root/'src/growth/reports.ts';original=source.read_bytes()
old=b'if(!result.shareAllowed) throw new HttpError(409,result.reason);'
mutant=original.replace(old,b'if(false) throw new HttpError(409,result.reason);',1);assert mutant!=original
run=lambda args:subprocess.run(['docker','compose','-p','n7f05b',*args],cwd=root,capture_output=True,text=True,check=True).stdout
try:
 source.write_bytes(mutant);run(['cp',str(source),'web:/app/src/growth/reports.ts'])
 r=subprocess.run(['docker','compose','-p','n7f05b','exec','-T','web','npx','tsx','--test','--test-concurrency=1','tests/evidence-integration.test.ts'],cwd=root,capture_output=True,text=True,timeout=90)
 (evidence/'sol-b-mutation.txt').write_text(r.stdout+r.stderr+f'\nMutant exit: {r.returncode}\n')
 assert r.returncode!=0 and 'ERR_ASSERTION' in r.stdout and '201 !== 409' in r.stdout,'share mutation did not fail the eligibility assertion'
 print('RED share guard: ineligible pair produced201 instead of409; exit',r.returncode)
finally:
 source.write_bytes(original);run(['cp',str(source),'web:/app/src/growth/reports.ts'])
 assert run(['exec','-T','web','sha256sum','src/growth/reports.ts']).split()[0]==hashlib.sha256(original).hexdigest()
 (evidence/'sol-b-restored.txt').write_text(hashlib.sha256(original).hexdigest()+' src/growth/reports.ts restored host/container\n')
