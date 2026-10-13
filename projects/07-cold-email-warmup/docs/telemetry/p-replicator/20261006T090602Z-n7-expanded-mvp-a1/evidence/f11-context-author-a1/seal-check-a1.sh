#!/bin/bash
set -eu
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f10_a2
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export NODE_OPTIONS="--import=/tmp/n7-f11-context-implement-a1/guard-a1.mjs"
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
exec 9>/tmp/codex-heavy-build.lock
flock -n 9
node --import tsx /tmp/n7-f11-context-implement-a1/preflight-a3.mjs > /tmp/n7-f11-context-implement-a1/final-db-cleanup.json
