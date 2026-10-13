from pathlib import Path
import json,hashlib,shutil
R=Path('/tmp/n7-f10-adversarial-fairness-a24');P=Path('/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup');m=json.loads(Path('/tmp/n7-f10-pair-fixture-fix-a22/final-manifest.json').read_text());allowed=['tests/f10-runtime-protocol.test.ts','tests/f10-runtime-fixture.ts','tests/f10-runtime-process-fixture.ts'];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for group in ['source','build','db']:
 for f,h in m[group].items():
  if f not in allowed:assert sha(P/f)==h,(group,f)
(R/'input-manifest.json').write_text(json.dumps({'original_manifest_sha256':sha(Path('/tmp/n7-f10-pair-fixture-fix-a22/final-manifest.json')),'allowed_delta':{f:{'old':m['source'][f],'new':sha(P/f)} for f in allowed},'source_count':len(m['source']),'build_count':len(m['build']),'SQL_count':len(m['db'])},indent=2)+'\n')
# Exact inherited corrected guard, with only evidence-root relocation.
g=Path('/tmp/n7-f10-pair-fixture-fix-a22/guard.mjs').read_text().replace('/tmp/n7-f10-pair-fixture-fix-a22',str(R));(R/'guard.mjs').write_text(g)
shutil.copyfile('/tmp/n7-f10-pair-fixture-fix-a22/pg-snapshot.mjs',R/'pg-snapshot.mjs')
