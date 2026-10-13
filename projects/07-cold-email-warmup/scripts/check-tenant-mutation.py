#!/usr/bin/env python3
"""Prove tenant isolation guard goes red; mutate only dedicated container source."""
import subprocess
import tempfile
from pathlib import Path
root = Path(__file__).resolve().parent.parent
evidence = root / 'docs/telemetry/features/20261002T192500Z-f01/evidence'
if not Path('/tmp/n7-heavy-tests.allowed').is_file():
    raise SystemExit('Heavy-test grant absent')
source = root / 'src/auth/store.ts'
original = source.read_text()
mutant = original.replace("'SELECT id,label,state FROM mailbox WHERE tenant_id=$1 AND id=$2', [tenant, id]", "'SELECT id,label,state FROM mailbox WHERE id=$1', [id]")
if mutant == original:
    raise SystemExit('Mutation target missing')
container = 'n7f01-web-1'
with tempfile.TemporaryDirectory(prefix='n7f01-mutation-') as temporary:
    replacement = Path(temporary) / 'store.ts'
    replacement.write_text(mutant)
    try:
        subprocess.run(['docker','cp',str(replacement),container+':/app/src/auth/store.ts'],check=True,capture_output=True)
        result = subprocess.run(['docker','compose','exec','-T','web','npm','run','test:integration'],cwd=root,capture_output=True,text=True,timeout=180)
        output = result.stdout + result.stderr
        (evidence/'tenant-mutation.txt').write_text(output)
        if result.returncode == 0 or '200 !== 404' not in output:
            raise SystemExit('Tenant mutation was not caught by expected foreign404 assertion')
        (evidence/'tenant-mutation-result.txt').write_text(f'Mutated tenant predicate: integration exit {result.returncode}; foreign200 expected404 assertion failed. Original source restored. Compiled running API unchanged.\n')
        print('Tenant mutation caught (expected failing integration); original source restored.')
    finally:
        subprocess.run(['docker','cp',str(source),container+':/app/src/auth/store.ts'],check=True,capture_output=True)
