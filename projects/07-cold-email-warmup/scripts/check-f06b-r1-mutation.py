#!/usr/bin/env python3
"""Restore the exact defective source constructor, prove RED, restore GREEN."""
from pathlib import Path
import subprocess, json, datetime, hashlib
root = Path(__file__).resolve().parent.parent
source = root / 'src/web/client.ts'
evidence = root / 'docs/telemetry/features/20261003T023900Z-f06'
original = source.read_bytes()
old = subprocess.check_output(['git', 'show', '50e3c26d93327dc16fee89cfbf8252bf5466cffe:projects/07-cold-email-warmup/src/web/client.ts'], cwd=root)
fixed = b'private transport: typeof fetch = fetch.bind(globalThis)'
broken = b'private transport: typeof fetch = fetch'
assert fixed in original and original.replace(fixed, broken, 1) == old
result = {'mutation': 'exact original actual src/web/client.ts', 'original_revision': '50e3c26d93327dc16fee89cfbf8252bf5466cffe'}
try:
    source.write_bytes(old)
    red = subprocess.run(['node_modules/.bin/tsx', '--test', 'tests/web-unit.test.ts'], cwd=root, capture_output=True, text=True)
    (evidence / 'sol-b-r1-mutation-red.log').write_text(red.stdout + red.stderr)
    result['red_exit'] = red.returncode
    assert red.returncode != 0 and 'network_error' in red.stdout, 'receiver mutation survived or unrelated failure'
finally:
    source.write_bytes(original)
green = subprocess.run(['node_modules/.bin/tsx', '--test', 'tests/web-unit.test.ts'], cwd=root, capture_output=True, text=True)
(evidence / 'sol-b-r1-mutation-green.log').write_text(green.stdout + green.stderr)
result.update(green_exit=green.returncode, restored_exactly=source.read_bytes() == original,
              source_sha256=hashlib.sha256(original).hexdigest(), at=datetime.datetime.now(datetime.timezone.utc).isoformat())
(evidence / 'sol-b-r1-mutation.json').write_text(json.dumps(result, indent=2) + '\n')
assert result['restored_exactly'] and green.returncode == 0
print(json.dumps(result))
