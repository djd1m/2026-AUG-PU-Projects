#!/bin/bash
# Установка зависимостей ВНУТРИ образа promo-render (нужна сеть: --network bridge).
# Первый раз без lockfile: npm install --save-exact → package-lock.json; дальше — npm ci.
set -euo pipefail
cd /work
export REMOTION_SKIP_BROWSER_DOWNLOAD=1 || true
if [ -f package-lock.json ]; then CMD="npm ci --no-audit --no-fund"; else CMD="npm install --save-exact --no-audit --no-fund"; fi
echo "cmd: $CMD"
TIMEFORMAT='install wall %R s, user %U s, sys %S s'
time $CMD
echo "node_modules: $(du -sh node_modules | cut -f1) ($(du -sb node_modules | cut -f1) bytes)"
npx --no-install remotion versions || true
