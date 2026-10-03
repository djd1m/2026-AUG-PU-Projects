#!/bin/bash
set +e
npm run typecheck
a=$?
npm test
b=$?
npm run test:int
c=$?
node scripts/mutate-source-management-guard.mjs
d=$?
node scripts/mutate-source-management-guard.mjs --live-retry
f=$?
npm run build
e=$?
printf '{"typecheck":%s,"unit":%s,"integration":%s,"critical_mutation":%s,"build":%s,"live_retry_mutation":%s}\n' "$a" "$b" "$c" "$d" "$e" "$f" > tests/artifacts/source-management/correction-full-stage-exits.json
if [ "$a$b$c$d$e$f" = "000000" ]; then exit 0; else exit 1; fi
