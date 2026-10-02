#!/usr/bin/env python3
"""Pre-lock clock capture mutant; restore source/container even on failure."""
import os,subprocess,hashlib
from pathlib import Path
root=Path(__file__).resolve().parent.parent
assert Path('/tmp/n7-f03b-heavy.allowed').is_file()
env={**os.environ,'COMPOSE_PROJECT_NAME':'n7f03b','N7_RUNTIME_DIR':'/tmp/n7-f03b-runtime','N7_WEB_PORT':'18704','N7_APP_ORIGIN':'http://127.0.0.1:18704','MAIL_PROVIDER_ALLOWLIST':'{"smtp.gmail.com":30,"imap.gmail.com":30}'}
source=root/'src/dispatch/submission.ts';original=source.read_bytes()
mutant=original.replace(b'  await this.fixtures.beforeFinal?.();',b'  await this.fixtures.beforeFinal?.();const now=this.now();',1).replace(b'   const now=this.now();\n',b'',1);assert mutant!=original
def copy():
 subprocess.run(['docker','compose','-p','n7f03b','cp',str(source),'web:/app/src/dispatch/submission.ts'],cwd=root,env=env,check=True,capture_output=True)
try:
 source.write_bytes(mutant);copy()
 result=subprocess.run(['docker','compose','-p','n7f03b','exec','-T','web','./node_modules/.bin/tsx','--test','tests/submission-integration.test.ts'],cwd=root,env=env,capture_output=True,text=True,timeout=120)
 (root/'docs/telemetry/features/20261002T211800Z-f03/sol-b-r1-clock-mutation.txt').write_text(result.stdout+result.stderr+f'\nMutant exit: {result.returncode}\n')
 assert result.returncode!=0 and 'ERR_ASSERTION' in result.stdout
 for boundary in ['lease45s','poll60s','retry120s','midnight']:
  assert any('not ok' in line and 'R1 post-lock clock '+boundary in line for line in result.stdout.splitlines()), boundary
 print('Pre-lock clock mutant rejected by all four realPG lock-wait boundary assertions.')
finally:
 source.write_bytes(original);copy()
 digest=hashlib.sha256(original).hexdigest()
 result=subprocess.run(['docker','compose','-p','n7f03b','exec','-T','web','sha256sum','src/dispatch/submission.ts'],cwd=root,env=env,capture_output=True,text=True,check=True)
 assert result.stdout.split()[0]==digest
 (root/'docs/telemetry/features/20261002T211800Z-f03/sol-b-r1-restored-source.txt').write_text(digest+'  src/dispatch/submission.ts (host=restored container)\n')
