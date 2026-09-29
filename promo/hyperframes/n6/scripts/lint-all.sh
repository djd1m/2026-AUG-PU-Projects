#!/bin/bash
# Внутри образа: hyperframes lint каждого из трёх собранных проектов. 0 — ошибок нет · 1 — есть · 2 — не выполнено.
set -u
cd /work || exit 2
HF=/work/node_modules/.bin/hyperframes
[ -x "$HF" ] || { echo "❌ нет $HF (npm ci?) — проверка НЕ выполнена" >&2; exit 2; }
rc=0
for f in 16x9 1x1 9x16; do
  [ -f "build/$f/index.html" ] || { echo "❌ нет build/$f/index.html (node build.mjs?) — проверка НЕ выполнена" >&2; exit 2; }
  echo "── lint $f"
  "$HF" lint "build/$f" "$@" || rc=1
done
exit $rc
