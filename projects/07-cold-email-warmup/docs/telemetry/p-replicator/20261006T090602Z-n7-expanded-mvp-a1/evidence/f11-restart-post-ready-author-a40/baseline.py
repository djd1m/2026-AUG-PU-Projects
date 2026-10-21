import subprocess,pathlib,json,hashlib,time,os
root=pathlib.Path('/tmp/n7-f11-restart-post-ready-author-a40');project=pathlib.Path('/tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup');wt=project.parents[1]
paths=['src/runtime/loop.ts','src/runtime/worker.ts','src/mailboxes/transport-lifetime.ts','src/replies/context-store.ts','src/replies/worker.ts','src/replies/store.ts']
backup={p:(project/p).read_bytes() for p in paths};out=[]
try:
 for p in paths:(project/p).write_bytes(subprocess.check_output(['git','show','b6e8ae16e8feb6c67888eb2f006cfbb299b40197:projects/07-cold-email-warmup/'+p],cwd=wt))
 root.joinpath('baseline-source.json').write_text(json.dumps({p:hashlib.sha256((project/p).read_bytes()).hexdigest() for p in paths}))
 with root.joinpath('baseline-build.raw').open('w') as f:r=subprocess.run(['flock','/tmp/codex-heavy-build.lock','/tmp/n7-expanded-runtime-20261006/bin/node','node_modules/typescript/bin/tsc','-p','tsconfig.build.json'],cwd=project,stdout=f,stderr=subprocess.STDOUT,timeout=60);out.append({'stage':'baseline_build','exit':r.returncode})
 root.joinpath('baseline').mkdir()
 with root.joinpath('baseline.raw').open('w') as f:r=subprocess.run(['bash',str(root/'targeted.sh'),'baseline'],stdout=f,stderr=subprocess.STDOUT,timeout=100);out.append({'stage':'baseline_targeted','exit':r.returncode})
finally:
 for p,b in backup.items():(project/p).write_bytes(b)
 root.joinpath('baseline-exits.json').write_text(json.dumps(out))
