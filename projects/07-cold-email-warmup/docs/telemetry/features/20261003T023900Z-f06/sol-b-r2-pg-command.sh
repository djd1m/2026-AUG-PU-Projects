#!/usr/bin/env bash
set -euo pipefail
cd /tmp/n7-f06b-r2/projects/07-cold-email-warmup
exec 9>/tmp/codex-heavy-build.lock
flock -n 9
trap 'date -u +"HEAVY_PG_RELEASED %Y-%m-%dT%H:%M:%SZ" >> /tmp/n7-f06b-r2-run/progress.md; flock -u 9' EXIT
date -u +"HEAVY_PG_ACQUIRED %Y-%m-%dT%H:%M:%SZ" >> /tmp/n7-f06b-r2-run/progress.md
python3 scripts/check-f06b-r1-mutation.py b-r2
 timeout 100s docker exec n7f06a-web-1 node_modules/.bin/tsx --test tests/suppression-integration.test.ts > docs/telemetry/features/20261003T023900Z-f06/sol-b-r2-pg.log 2>&1
echo 0 > docs/telemetry/features/20261003T023900Z-f06/sol-b-r2-pg.exit
N7_F06_BINDING_PREFIX=sol-b-r2 python3 scripts/check-f06b-r1-snapshot.py verify
