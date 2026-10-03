#!/usr/bin/env python3
"""Mutate the actual central401 authority guard, prove RED, restore and prove GREEN."""
from pathlib import Path
import subprocess,json,datetime
root=Path(__file__).resolve().parent.parent
source=root/'src/web/page.ts';original=source.read_text()
evidence=root/'docs/telemetry/features/20261003T023900Z-f06';evidence.mkdir(parents=True,exist_ok=True)
needle="if(r.ok)signedIn();"
assert needle in original
results={}
try:
 source.write_text(original.replace(needle,'if(r.ok)signedIn(true);',1))
 r=subprocess.run(['node_modules/.bin/tsx','--test','tests/auth-script-unit.test.ts'],cwd=root,capture_output=True,text=True)
 (evidence/'sol-a-r1-mutation-red.log').write_text(r.stdout+r.stderr);results['red_exit']=r.returncode
 assert r.returncode!=0,'mutation survived'
finally:
 source.write_text(original)
r=subprocess.run(['node_modules/.bin/tsx','--test','tests/auth-script-unit.test.ts'],cwd=root,capture_output=True,text=True)
(evidence/'sol-a-r1-mutation-green.log').write_text(r.stdout+r.stderr);results['green_exit']=r.returncode
results['at']=datetime.datetime.now(datetime.timezone.utc).isoformat();results['mutation']='old passive login broadcast restored in actual src/web/page.ts'
(evidence/'sol-a-r1-mutation.json').write_text(json.dumps(results,indent=2)+'\n')
assert source.read_text()==original, 'restore differs'
assert r.returncode==0
