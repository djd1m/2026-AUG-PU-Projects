#!/usr/bin/env bash
set -euo pipefail
N7_TASK_RUNTIME_DIR="${N7_RUNTIME_DIR:-/tmp/n7-f01-runtime}"
mkdir -p "$N7_TASK_RUNTIME_DIR"
chmod 700 "$N7_TASK_RUNTIME_DIR"
for filename in session-key db-password; do
  if [ ! -f "$N7_TASK_RUNTIME_DIR/$filename" ]; then
    (umask 077; openssl rand -base64 48 > "$N7_TASK_RUNTIME_DIR/$filename")
  fi
done
# Docker secrets are readable by the non-root application; parent directory remains private.
chmod 444 "$N7_TASK_RUNTIME_DIR/session-key" "$N7_TASK_RUNTIME_DIR/db-password"
echo 'Local runtime key files present; values suppressed.'
