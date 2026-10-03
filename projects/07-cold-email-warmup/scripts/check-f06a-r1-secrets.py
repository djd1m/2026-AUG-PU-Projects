#!/usr/bin/env python3
from pathlib import Path
import subprocess,json,datetime
root=Path(__file__).resolve().parent.parent;runtime=Path('/tmp/n7-f06a-runtime');e=root/'docs/telemetry/features/20261003T023900Z-f06'
secrets=[(runtime/name).read_text().strip() for name in ['session-key','db-password','recipient-hash-key','operator-token']]
secrets.extend(json.loads((runtime/'credential-keyring.json').read_text())['keys'].values())
assert all(secrets)
logs=subprocess.check_output(['docker','compose','-p','n7f06a','logs','--no-color'],cwd=root,text=True)
assert not any(secret in logs for secret in secrets);assert 'N7_F06_PRIVATE_' not in logs
files=[*root.glob('src/**/*.ts'),*root.glob('tests/*.ts'),*root.glob('docs/telemetry/features/20261003T023900Z-f06/*'),*root.glob('scripts/check-f06a*')]
assert not any(secret in p.read_text(errors='replace') for secret in secrets for p in files if p.is_file())
(e/'sol-a-r1-secrets.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'secret_values_suppressed':True,'runtime_secret_count':len(secrets),'project_files_and_own_logs':'pass','api_canary':'asserted by full F01/F02/F06 integration tests'},indent=2)+'\n')
print('F06 secret scan pass (values suppressed)')
