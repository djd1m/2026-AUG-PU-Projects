from pathlib import Path
import subprocess,json,hashlib,datetime
root=Path.cwd(); evidence=root/'tests/artifacts/transcription/mutations'; evidence.mkdir(exist_ok=True)
cases=[
 ('adr003','packages/shared/src/transcript.ts','row.words.length === 0','false','tests/transcription-order.test.ts','ADR-003 empty words'),
 ('provider-pin','apps/worker/src/stt/client.ts',"only: ['Together'], ",'','tests/transcription.test.ts','provider pin source guard'),
 ('quota-order','apps/worker/src/workers/stt.ts','const accepted = await acceptProbe(deps.pool, attempt, deps.limits, measured.durationSec, now());',"const accepted = 'transcribing' as const;",'tests/transcription-order.test.ts','minutes committed BEFORE'),
 ('retry-quota','packages/db/src/transcription.ts','if (previous > 0) {','if (previous < 0) {','tests/transcription-quota.test.ts','retry charges both'),
 ('merge-offset','apps/worker/src/stt/merge.ts','start: word.start + chunk.offsetSeconds','start: word.start','tests/transcription.test.ts','merge offsets second'),
]
results=[]
for name,file,old,new,test,pattern in cases:
 p=root/file; original=p.read_text(); assert original.count(old)==1,(name,original.count(old))
 changed=original.replace(old,new)
 if name=='quota-order':
  old2='await deps.continueTranscription(file, measured.durationSec, attempt);'
  assert changed.count(old2)==1
  changed=changed.replace(old2,old2+'\n        await acceptProbe(deps.pool, attempt, deps.limits, measured.durationSec, now());')
 command=['node','node_modules/vitest/vitest.mjs','run',test,'-t',pattern]
 def run(color):
  r=subprocess.run(command,cwd=root,capture_output=True,text=True,timeout=50)
  (evidence/f'{name}-{color}.txt').write_text(r.stdout+r.stderr)
  return r.returncode
 try:
  p.write_text(changed); red=run('red')
 finally:p.write_text(original)
 green=run('green'); results.append({'guard':name,'file':file,'command':command,'red_exit':red,'green_exit':green,'source_sha256':hashlib.sha256(original.encode()).hexdigest()})
 print(name,red,green,flush=True)
(evidence/'results.json').write_text(json.dumps(results,indent=2)+'\n')
assert all(r['red_exit']==1 and r['green_exit']==0 for r in results)
