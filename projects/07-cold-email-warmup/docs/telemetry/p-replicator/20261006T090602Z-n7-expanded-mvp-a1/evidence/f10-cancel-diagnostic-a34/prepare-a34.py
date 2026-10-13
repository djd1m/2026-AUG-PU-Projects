from pathlib import Path
import json,hashlib,os
A=Path('/tmp/n7-f10-atomic-admission-negatives-a33');R=Path('/tmp/n7-f10-cancel-diagnostic-a34');P=Path('/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup');S=R/'compact-shadow-a34';sha=lambda f:hashlib.sha256(Path(f).read_bytes()).hexdigest();inv=json.loads((A/'input-inventory-a33.json').read_text());files={}
for f,h in inv['shadow_files'].items():
 src=A/'compact-shadow-a33'/f;assert sha(src)==h;dest=S/f;dest.parent.mkdir(parents=True,exist_ok=True);assert not dest.exists();dest.write_bytes(src.read_bytes());files[f]=sha(dest)
(S/'node_modules').symlink_to(P/'node_modules',target_is_directory=True)
for old,new in [('guard-a33.mjs','guard-a34.mjs'),('suite-output-a33.mjs','suite-output-a34.mjs'),('pg-snapshot-a33.mjs','pg-snapshot-a34.mjs'),('pg-owned-status-a33.mjs','pg-owned-status-a34.mjs'),('canary-a33.py','canary-a34.py')]:
 s=(A/old).read_text().replace(str(A),str(R)).replace('a33','a34');(R/new).write_text(s)
s=(A/'native-run-a33.py').read_text().replace(str(A),str(R)).replace('pg-snapshot-a33','pg-snapshot-a34').replace('pg-owned-status-a33','pg-owned-status-a34').replace('guard-a33','guard-a34').replace('suite-output-a33','suite-output-a34');s=s.replace("[str(R),'/tmp/n7-f10-atomic-admission-verify-a32']","[str(R),'/tmp/n7-f10-atomic-admission-verify-a32','/tmp/n7-f10-atomic-admission-negatives-a33']");(R/'native-run-a34.py').write_text(s)
p=json.loads((A/'combined-material-plan-a33.json').read_text());cases=p['new_atomic_material8'][6:]
for c in cases:
 old=c['changes'][0]['old'];dist='dist/replies/worker.js';t=(S/dist).read_text();parts=['await runtimeGuard(c);','await source(c);','await transport?.(c);'];assert all(part in t for part in parts)
 # TS test imports exact src module through tsx; dist is separately bound but not claimed executed by this title.
 c['execution_binding']={'test_import':"await import('../src/replies/worker.js')",'tsx_resolves':'src/replies/worker.ts','dist_binding':'frozen matching compiled component retained; not executed by this source title'};c['budget_s']=20
(R/'fence-plan-a34.json').write_text(json.dumps(cases,indent=2)+'\n');(R/'shadow-inputs-a34.json').write_text(json.dumps(files,indent=2)+'\n')
print(json.dumps({'files':len(files),'bytes':sum((S/f).stat().st_size for f in files),'helper_hashes':{f.name:sha(f) for f in R.iterdir() if f.is_file()}}))
