#!/bin/bash
set -u
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f11_a8
export N7_DB_OWNERSHIP_LEASE=/tmp/n7-f11-context-verify-a11/database-ownership-lease.json
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export NODE_OPTIONS='--import /tmp/n7-f11-continuation-fleet-diagnostic-a26/guard-a26.mjs --import /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup/node_modules/tsx/dist/loader.mjs'
exec python3 /tmp/n7-f11-continuation-fleet-diagnostic-a26/native-runner.py "$1"
