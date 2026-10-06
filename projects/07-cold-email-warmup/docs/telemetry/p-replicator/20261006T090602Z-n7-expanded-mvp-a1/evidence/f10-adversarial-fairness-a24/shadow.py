from pathlib import Path
import shutil,json,hashlib
R=Path('/tmp/n7-f10-adversarial-fairness-a24');P=Path('/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup');S=R/'compact-shadow';S.mkdir()
for d in ['src','dist','db','tests']:shutil.copytree(P/d,S/d)
for f in ['package.json','tsconfig.json','tsconfig.build.json']:shutil.copyfile(P/f,S/f)
(S/'node_modules').symlink_to(P/'node_modules',target_is_directory=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(R/'shadow-manifest.json').write_text(json.dumps({'files':{str(p.relative_to(S)):sha(p) for p in S.rglob('*') if p.is_file() and 'node_modules' not in p.parts},'total_bytes':sum(p.stat().st_size for p in S.rglob('*') if p.is_file() and 'node_modules' not in p.parts)},indent=2)+'\n')
