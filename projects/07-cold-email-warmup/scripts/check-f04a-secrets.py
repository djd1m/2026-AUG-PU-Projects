#!/usr/bin/env python3
"""Check real isolated runtime logs and reply persistence for fixture secret/header/body canaries."""
import os, subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
env={**os.environ,'COMPOSE_PROJECT_NAME':'n7f04a','N7_RUNTIME_DIR':'/tmp/n7-f04a-runtime','N7_WEB_PORT':'18705','N7_APP_ORIGIN':'http://127.0.0.1:18705','MAIL_PROVIDER_ALLOWLIST':'{"smtp.gmail.com":30,"imap.gmail.com":30}'}
def run(args):
 return subprocess.run(['docker','compose','-p','n7f04a',*args],cwd=root,env=env,check=True,capture_output=True,text=True).stdout
logs=run(['logs','--no-color'])
reply=run(['exec','-T','db','psql','-U','n7','-d','n7','-Atc',"SELECT row_to_json(r) FROM reply_observation r UNION ALL SELECT row_to_json(r) FROM reply_message r UNION ALL SELECT row_to_json(r) FROM reply_effect r"])
for value in ['N7_CREDENTIAL_CANARY_F04A','N7_HEADER_CANARY_F04A','N7_BODY_CANARY_F04A']:
 assert value not in logs and value not in reply,value
for filename in ['session-key','db-password','recipient-hash-key','credential-keyring.json']:
 secret=(Path('/tmp/n7-f04a-runtime')/filename).read_text().strip()
 assert secret not in logs and secret not in reply
print('PASS: actual runtime logs and durable reply tables contain no credential/header-display/body canaries or runtime secret values.')
