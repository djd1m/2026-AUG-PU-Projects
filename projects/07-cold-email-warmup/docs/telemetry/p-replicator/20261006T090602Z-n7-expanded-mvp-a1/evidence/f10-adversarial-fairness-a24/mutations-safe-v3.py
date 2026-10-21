from pathlib import Path
import subprocess,json,hashlib,datetime
R=Path('/tmp/n7-f10-adversarial-fairness-a24');S=R/'compact-shadow';f=S/'dist/runtime/store.js';original=f.read_bytes();sha=lambda b:hashlib.sha256(b).hexdigest();results=[]
def run(stage):
 code=subprocess.call(['python3',str(R/'run.py'),stage,str(S)]);tap=(R/(stage+'.tap')).read_text();return {'stage':stage,'code':code,'named_assertion':'fair E selection precedes ANY A-D second quantum after actual restart' in tap,'ERR_ASSERTION':'ERR_ASSERTION' in tap,'restored':f.read_bytes()==original}
try:
 for name,old,new in [('oldest-due', 'ORDER BY t.service_seq,d.service_seq,d.due_at,d.mailbox_id','ORDER BY t.service_seq,d.due_at,d.service_seq,d.mailbox_id'),('reset-yield-sequence',"next_check_at=${next},due_at=CASE", "service_seq=0,next_check_at=${next},due_at=CASE")]:
  assert old.encode() in original,name;mutated=original.replace(old.encode(),new.encode());f.write_bytes(mutated);(R/(name+'-mutation-v3.json')).write_text(json.dumps({'original_sha256':sha(original),'mutated_sha256':sha(mutated),'path':str(f),'old':old,'new':new},indent=2)+'\n')
  try:
   negative=run(name+'-negative-v3');results.append(negative);assert negative['code']==1 and negative['named_assertion'] and negative['ERR_ASSERTION'],negative
  finally:
   f.write_bytes(original);(R/(name+'-exact-restore-v3.json')).write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'restored_sha256':sha(f.read_bytes()),'original_sha256':sha(original),'exact_equal':f.read_bytes()==original})+'\n')
 restored=run('common-exact-restored-v3');results.append(restored);assert restored['code']==0 and restored['restored'],restored
 (R/'mutation-results-v3.json').write_text(json.dumps({'checks':results,'passed':True,'exact_restored_sha256':sha(f.read_bytes()),'restoration_design':'Each mutation red followed by immediate exact-byte restoration; one common final native GREEN over the identical original source validates both restored states; no intermediate GREEN claimed'},indent=2)+'\n')
finally:
 f.write_bytes(original);(R/'mutation-terminal-v3.json').write_text(json.dumps({'checks':results,'exact_restored':f.read_bytes()==original,'finished_at':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2)+'\n')
