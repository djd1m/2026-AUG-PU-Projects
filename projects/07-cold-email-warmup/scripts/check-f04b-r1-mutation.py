#!/usr/bin/env python3
"""Exercise both obsolete capture and obsolete first-failure guards, restoring in finally."""
import hashlib, os, subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
evidence=root/'docs/telemetry/features/20261002T232200Z-f04'
def run(args):
 return subprocess.run(['docker','compose','-p','n7f04b',*args],cwd=root,check=True,capture_output=True,text=True).stdout
for name,rel,old,new in [('capture','src/replies/store.ts',b'   await guard?.(c);\n',b''),('failure','src/replies/worker.ts',b'await guard!(c);await c.query',b'await c.query')]:
 source=root/rel;original=source.read_bytes();mutant=original.replace(old,new,1);assert mutant!=original
 try:
  source.write_bytes(mutant);run(['cp',str(source),'web:/app/'+rel])
  r=subprocess.run(['docker','compose','-p','n7f04b','exec','-T','web','./node_modules/.bin/tsx','--test','tests/suppression-owner-integration.test.ts'],cwd=root,capture_output=True,text=True,timeout=45)
  (evidence/f'sol-b-r1-mutation-{name}.txt').write_text(r.stdout+r.stderr+f'\nMutant exit: {r.returncode}\n')
  assert r.returncode!=0 and 'ERR_ASSERTION' in r.stdout, name
  print('RED '+name+': obsolete callback changed durable evidence; assertion exit '+str(r.returncode))
 finally:
  source.write_bytes(original);run(['cp',str(source),'web:/app/'+rel]);digest=hashlib.sha256(original).hexdigest()
  assert run(['exec','-T','web','sha256sum',rel]).split()[0]==digest
  (evidence/f'sol-b-r1-restored-{name}.txt').write_text(digest+' '+rel+' (host=restored container source)\n')
