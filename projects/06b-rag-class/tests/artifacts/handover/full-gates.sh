#!/bin/bash
set +e
npm run typecheck
a=$?
npm test
b=$?
npm run test:int
c=$?
node tests/artifacts/handover/mutate-critical-guard.mjs
d=$?
npm run build
e=$?
printf '{"typecheck":%s,"unit":%s,"integration":%s,"critical_mutation":%s,"build":%s}\n' "$a" "$b" "$c" "$d" "$e" > tests/artifacts/handover/full-stage-exits.json
if [ "$a$b$c$d$e" = "00000" ]; then exit 0; else exit 1; fi
