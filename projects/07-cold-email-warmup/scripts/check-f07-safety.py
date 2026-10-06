#!/usr/bin/env python3
"""Scoped read-only runtime secret scan; fixture literals are allowed only in tests."""
from pathlib import Path
import subprocess,hashlib,json
root=Path(__file__).resolve().parents[1]
evidence=Path('/tmp/n7-f07-implement-a1')
secrets=[(Path('/tmp/n7-f06a-runtime')/name).read_text().strip() for name in ['session-key','db-password','operator-token','recipient-hash-key','credential-keyring.json']]
paths=[p for folder in ['src','db','tests','scripts'] for p in (root/folder).rglob('*') if p.is_file()]
assert all(not any(secret in p.read_text(errors='replace') for secret in secrets) for p in paths),'secret present (suppressed)'
result=subprocess.run(['docker','logs','n7f06a-web-1'],capture_output=True,text=True,check=True)
assert not any(secret in result.stdout+result.stderr for secret in secrets),'secret in own log (suppressed)'
assert 'N7_F07_SECRET_CANARY' not in result.stdout+result.stderr,'canary in own log (suppressed)'
source=hashlib.sha256(''.join(str(p.relative_to(root))+':'+hashlib.sha256(p.read_bytes()).hexdigest()+'\n' for p in sorted(paths)).encode()).hexdigest()
(evidence/'secret-scan.json').write_text(json.dumps({'pass':True,'source':source,'paths':len(paths),'runtime_values':'suppressed'},indent=2)+'\n')
print('F07 scoped secret and own runtime log scan PASS; values suppressed')
