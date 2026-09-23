import pathlib,subprocess,json,hashlib
root=pathlib.Path.cwd(); dest=root/'tests/artifacts/transcription-fix'; results=[]
mutations=[
 ('video-duration','apps/worker/src/workers/stt.ts','mergeWords(results, duration, audioDuration,','mergeWords(results, duration, duration,','TR-001 accepts'),
 ('no-audio-bound','packages/shared/src/transcript.ts','end > duration','false','TR-002 rejects'),
 ('wrong-failure','apps/worker/src/workers/stt.ts',"signal.aborted ? 'stalled' : error instanceof TranscriptError ? 'no_timestamps'", "signal.aborted ? 'stalled' : (error instanceof TranscriptError || error instanceof TranscriptMergeError) ? 'no_timestamps'",'TR-002 rejects'),
]
for name,file,old,new,test in mutations:
 p=root/file; original=p.read_text(); assert original.count(old)==1, (file,old)
 row={'name':name,'file':file,'original_sha256':hashlib.sha256(original.encode()).hexdigest(),'old':old,'new':new}
 try:
  p.write_text(original.replace(old,new))
  with (dest/(name+'-red.txt')).open('w') as out:
   row['red_exit']=subprocess.run(['npx','vitest','run','tests/transcription-order.test.ts','-t',test],stdout=out,stderr=subprocess.STDOUT).returncode
 finally: p.write_text(original)
 with (dest/(name+'-green.txt')).open('w') as out:
  row['green_exit']=subprocess.run(['npx','vitest','run','tests/transcription-order.test.ts','-t',test],stdout=out,stderr=subprocess.STDOUT).returncode
 row['restored']=hashlib.sha256(p.read_bytes()).hexdigest()==row['original_sha256']; results.append(row)
(dest/'mutations.json').write_text(json.dumps(results,indent=2)+'\n')
assert all(r['red_exit']==1 and r['green_exit']==0 and r['restored'] for r in results),results
print(json.dumps(results,indent=2))
