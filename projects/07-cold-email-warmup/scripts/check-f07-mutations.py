#!/usr/bin/env python3
"""Two bounded lease predicate guard mutations on an isolated temporary copy."""
from pathlib import Path
import shutil,subprocess,os,json,hashlib
root=Path(__file__).resolve().parents[1];dest=Path('/tmp/n7-f07-implement-a1/mutation')
dest.mkdir(exist_ok=False)
for name in ['src','tests','db']:shutil.copytree(root/name,dest/name)
for name in ['package.json','tsconfig.json']:shutil.copy(root/name,dest/name)
(dest/'node_modules').symlink_to('/tmp/n7-expanded-runtime-20261006/node_modules')
path=dest/'src/dispatch/eligibility.ts';original=path.read_text();reports=[]
for name,replacement in [('missing-lease'," AND EXISTS(SELECT 1 FROM capacity_lease l WHERE l.tenant_id=m.tenant_id AND l.mailbox_id=m.id AND l.state='active' AND l.expires_at>$1)"),('expired-lease',' AND l.expires_at>$1')]:
 mutated=original.replace(replacement,'');assert mutated!=original;path.write_text(mutated)
 result=subprocess.run([str(dest/'node_modules/.bin/tsx'),'--test','tests/capacity-integration.test.ts'],cwd=dest,capture_output=True,text=True,timeout=80)
 log=Path('/tmp/n7-f07-implement-a1')/('mutation-'+name+'.log');log.write_text(result.stdout+result.stderr)
 assert result.returncode!=0 and 'sender and pool recipient need active lease' in result.stdout,name+' survived'
 reports.append({'mutation':name,'exit':result.returncode,'changed_sha256':hashlib.sha256(mutated.encode()).hexdigest(),'guard_failed':True})
path.write_text(original);Path('/tmp/n7-f07-implement-a1/mutations.json').write_text(json.dumps(reports,indent=2)+'\n');print('F07 two independent capacity fence mutations rejected')
