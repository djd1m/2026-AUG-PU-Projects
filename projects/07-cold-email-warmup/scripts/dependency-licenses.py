#!/usr/bin/env python3
"""Record locked direct/transitive licenses from locally installed metadata."""
import json
from pathlib import Path
root = Path(__file__).resolve().parent.parent
lock = json.loads((root / 'package-lock.json').read_text())
manifest = json.loads((root / 'package.json').read_text())
direct = {**manifest.get('dependencies', {}), **manifest.get('devDependencies', {})}
rows = ['# F01 dependency licenses', '', 'Generated from installed package.json metadata and package-lock.json; runtime native bindings included. Missing optional platform packages are marked explicitly.', '', '| Package | Locked version | Scope | Installed license | Evidence |', '|---|---|---|---|---|']
for path, entry in sorted(lock['packages'].items()):
    if not path:
        continue
    meta = root / path / 'package.json'
    name = path.split('node_modules/')[-1]
    if meta.is_file():
        data = json.loads(meta.read_text())
        license_value = data.get('license', data.get('licenses', 'UNKNOWN'))
        if isinstance(license_value, (dict, list)):
            license_value = json.dumps(license_value)
        assert data['version'] == entry['version']
        evidence = f'`{path}/package.json`'
    else:
        license_value = 'Not installed (optional platform); lock: ' + str(entry.get('license', 'UNKNOWN'))
        evidence = '`package-lock.json` only'
    rows.append(f"| {name} | {entry['version']} | {'direct' if name in direct else 'transitive'} | {license_value} | {evidence} |")
(root / 'docs/features/f01-foundation-auth/dependency-licenses.md').write_text('\n'.join(rows) + '\n')
print('Dependency license record written; metadata values only.')
