#!/usr/bin/env python3
"""One bounded guard mutation, restored even on failure. Run under heavy lease."""
import subprocess,os
from pathlib import Path
root=Path(__file__).resolve().parent.parent
source=root/'src/dispatch/eligibility.ts'
original=source.read_text()
mutant=original.replace("p.completed_at>$1::timestamptz-interval '60 seconds'",'TRUE')
assert mutant!=original
env={**os.environ,'COMPOSE_PROJECT_NAME':'n7f03a','N7_RUNTIME_DIR':'/tmp/n7-f03a-runtime','MAIL_PROVIDER_ALLOWLIST':'{"smtp.gmail.com":30,"imap.gmail.com":30}'}
def copy():
 subprocess.run(['docker','compose','-p','n7f03a','cp',str(source),'web:/app/src/dispatch/eligibility.ts'],cwd=root,env=env,check=True,capture_output=True)
try:
 source.write_text(mutant)
 copy()
 result=subprocess.run(['docker','compose','-p','n7f03a','exec','-T','web','./node_modules/.bin/tsx','--test','tests/dispatch-integration.test.ts'],env=env,cwd=root,capture_output=True,text=True)
 # Fixtures requiring stale polls to remain excluded must be the failing assertion.
 evidence=root/'docs/telemetry/features/20261002T211800Z-f03/sol-a-mutation.txt'
 evidence.write_text(result.stdout+result.stderr+f'\nMutant exit: {result.returncode}\n')
 assert result.returncode!=0 and 'fresh complete current opt-in' in result.stdout and 'ERR_ASSERTION' in result.stdout
 print('Freshness guard mutant rejected; source restored.')
finally:
 source.write_text(original)
 copy()
