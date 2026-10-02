#!/usr/bin/env bash
set -euo pipefail
N7_TASK_RUNTIME_DIR="${N7_RUNTIME_DIR:-/tmp/n7-f02-runtime}"
mkdir -p "$N7_TASK_RUNTIME_DIR"
chmod 700 "$N7_TASK_RUNTIME_DIR"
for filename in session-key db-password; do
  if [ ! -f "$N7_TASK_RUNTIME_DIR/$filename" ]; then
    (umask 077; openssl rand -base64 48 > "$N7_TASK_RUNTIME_DIR/$filename")
  fi
done
if [ ! -f "$N7_TASK_RUNTIME_DIR/credential-keyring.json" ]; then
  (umask 077; N7_TASK_RUNTIME_DIR="$N7_TASK_RUNTIME_DIR" python3 - <<'KEYGEN'
import json,os,secrets,base64
from pathlib import Path
(Path(os.environ['N7_TASK_RUNTIME_DIR'])/'credential-keyring.json').write_text(json.dumps({'activeVersion':'v1','keys':{'v1':base64.b64encode(secrets.token_bytes(32)).decode()}}))
KEYGEN
  )
fi
chmod 400 "$N7_TASK_RUNTIME_DIR/credential-keyring.json"
# Docker secrets are readable by the non-root application; parent directory remains private.
chmod 444 "$N7_TASK_RUNTIME_DIR/session-key" "$N7_TASK_RUNTIME_DIR/db-password" "$N7_TASK_RUNTIME_DIR/credential-keyring.json"
echo 'Local runtime key files present; values suppressed.'
