#!/usr/bin/env python3
"""Return the exact F1/F2 defects, require new negative assertions RED, restore bytes."""
import hashlib, json, re, subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
e=root/'docs/telemetry/features/20261003T010600Z-f05'
def compose(*args):
 return subprocess.run(['docker','compose','-p','n7f05b',*args],cwd=root,capture_output=True,text=True,check=True).stdout
mutations=[
 ('direction','src/evidence/input.ts',b"typeof input.direction!=='string' || !['higher','lower'].includes(input.direction)",b"!['higher','lower'].includes(String(input.direction))",'F1 primitive direction'),
 ('kind','src/growth/reports.ts',b"typeof input.kind!=='string' || !['copy','link'].includes(input.kind)",b"!['copy','link'].includes(String(input.kind))",'F1 primitive kind'),
 ('uuid','src/evidence/input.ts',b'return value.toLowerCase();',b'return value;','B3 concurrent explicit share'),
]
proof=[]
for name,relative,old,new,assertion in mutations:
 source=root/relative;original=source.read_bytes();assert original.count(old)==1
 mutant=original.replace(old,new,1);assert mutant!=original
 try:
  source.write_bytes(mutant);compose('cp',str(source),'web:/app/'+relative)
  result=subprocess.run(['docker','compose','-p','n7f05b','exec','-T','web','npx','tsx','--test','--test-concurrency=1','tests/evidence-integration.test.ts'],cwd=root,capture_output=True,text=True,timeout=90)
  log=result.stdout+result.stderr+f'\nMutant exit: {result.returncode}\n';(e/f'sol-b-r1-mutation-{name}.txt').write_text(log)
  assert result.returncode!=0 and 'ERR_ASSERTION' in log and re.search(r'not ok[^\n]*'+re.escape(assertion),log),'exact new assertion did not fail'
  if name!='uuid':assert '400' in log,'enum negative did not fail expected400'
  proof.append({'name':name,'exit':result.returncode,'assertion':assertion,'original_sha256':hashlib.sha256(original).hexdigest(),'mutant_sha256':hashlib.sha256(mutant).hexdigest()})
  print('RED',name,assertion,'exit',result.returncode)
 finally:
  source.write_bytes(original);compose('cp',str(source),'web:/app/'+relative)
  assert compose('exec','-T','web','sha256sum',relative).split()[0]==hashlib.sha256(original).hexdigest()
(e/'sol-b-r1-mutations.json').write_text(json.dumps(proof,indent=2)+'\n')
print('Restored host/container bytes for all three mutants')
