#!/usr/bin/env python3
"""Prove the public DNS guard detects a bypass; restore exact source bytes."""
import os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
source=root/'src/mailboxes/network.ts'
original=source.read_bytes()
needle=b"addresses.some(a=>!isPublicIp(a.address) || isIP(a.address)!==a.family)"
assert original.count(needle)==1
try:
    source.write_bytes(original.replace(needle,b'false'))
    command=['taskset','-c',','.join(map(str,sorted(os.sched_getaffinity(0))[:2])),'node','node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','tests/mailboxes-unit.test.ts']
    result=subprocess.run(command,cwd=root,capture_output=True,text=True)
    evidence=root/'docs/telemetry/features/20261002T201500Z-f02/evidence/mutation.txt'
    evidence.write_text('Mutation: bypass addresses.some public/mixed DNS rejection.\nCommand: '+' '.join(command)+'\nExit: '+str(result.returncode)+'\n'+result.stdout+result.stderr)
    if result.returncode==0 or 'Missing expected rejection' not in result.stdout:
        raise SystemExit('Mutation guard inconclusive or incorrectly passed')
finally:
    source.write_bytes(original)
assert source.read_bytes()==original
print('DNS bypass mutant failed; exact source restored. Mutation proof exit0.')
