#!/usr/bin/env python3
"""Mutate the actual central401 authority guard, prove RED, restore and prove GREEN."""
from pathlib import Path
import subprocess,json,datetime
root=Path(__file__).resolve().parent.parent
source=root/'src/web/client.ts';original=source.read_text()
evidence=root/'docs/telemetry/features/20261003T023900Z-f06';evidence.mkdir(parents=True,exist_ok=True)
needle='if (response.status === 401) {'
assert needle in original
results={}
try:
 source.write_text(original.replace(needle,'if (response.status === 999) {',1))
 r=subprocess.run(['node_modules/.bin/tsx','--test','tests/web-unit.test.ts'],cwd=root,capture_output=True,text=True)
 (evidence/'sol-a-mutation-red.log').write_text(r.stdout+r.stderr);results['red_exit']=r.returncode
 assert r.returncode!=0,'mutation survived'
finally:
 source.write_text(original)
r=subprocess.run(['node_modules/.bin/tsx','--test','tests/web-unit.test.ts'],cwd=root,capture_output=True,text=True)
(evidence/'sol-a-mutation-green.log').write_text(r.stdout+r.stderr);results['green_exit']=r.returncode
results['at']=datetime.datetime.now(datetime.timezone.utc).isoformat();results['mutation']='central401 invalidation disabled in actual src/web/client.ts'
(evidence/'sol-a-mutation.json').write_text(json.dumps(results,indent=2)+'\n')
assert r.returncode==0
