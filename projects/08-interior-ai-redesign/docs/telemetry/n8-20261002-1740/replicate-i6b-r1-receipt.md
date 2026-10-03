# I6b exact two-finding correction receipt

RUN_ID: n8-20261002-1740
WORK_UNIT_ID: n8-replicate-i6b-r1
Attempt-ID: replicate-i6b-r1-1
Source: 8041f21f515e74d883c7fbba6747ab2d45bcc561
Source-Revision: 8041f21f515e74d883c7fbba6747ab2d45bcc561
Launch-SHA256: bf9544cbb98ad17ae977b8b2369988b88b1fb301c2e1cf585c68753ac5518192
Spec-SHA256: 2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Profile: compact-quality-first-v2; inherited F07 XL, sole bounded correction override.
Requested model/effort: gpt-6.1-sol/high.
Actual model/effort: null; host metadata attachment parent-owned.
Usage: null. Cost: null. Active time: null. No inferred counters or savings.
Finished-At: 2026-10-03T15:28:37.967835+00:00
Elapsed since caller launch: 528.044 seconds.
Frozen-At: 2026-10-03T15:27:29.259173+00:00
Verdict: PASS for the bounded source correction and permitted checks; runtime acceptance pending.

I6B-R1: a matching exact-job DELETE response observer is registered before the
existing clickAndWaitForHandler invocation. Response and handler completion are
awaited together; response status 200 and owner GET 404 are required before the
held POST gate is released. Hidden-result check and finally release/cancel/join,
subsequent evidence/credit/fence/artifact assertions remain preserved.

I6B-R2: SELECT retrieves canonical_evidence and evidence_sha; the existing canonical
helper supplies sha(canonical(e)), asserted equal to the stored digest. Receipt
reports the stored digest. Output/depth/config byte checks and null provider metric
checks remain intact.

Only owned scripts/ui/replicate-cases.js changed plus narrowly focused new
tests/ui-replicate-corrections.test.js. The latter executes actual scoped function
bodies under controlled boundary doubles, without PG/browser execution. Final
focused check passes 5/5, exit 0, no skips. It covers delayed deletion and handler
completion, exact response matching, 200/404 gates, failure cleanup, JSONB-equivalent
key order and corrupt stored hashes. Fixed oracles reject in-memory broken digest
and handler-wait variants. Initial focused harness failure is retained (3/5, exit1);
final corrected focused evidence is separate. No unchanged broad suite rerun.

Final owned-module syntax check and scripts/check.js pass (exit 0). Source/launch,
original eight non-owned I6b files, all 131 protected hashes, all nine original check
receipts/check history, line/whitespace/scope guards pass. Existing 43/43 green logs
are unchanged historical evidence, not claimed fresh execution. No production,
backend, UI predicate, compose, driver, other cases, run/events or original log edits.
No delegation, other CLI/models, Docker/PG/browser/network/provider actions,
environment inspection, installations, commits or global configuration changes.

Correction report: docs/features/f07-replicate/i6b-r1-correction.md
Correction report SHA256: d98d94c0e67a8c005a4b626bce1c7253991f9f9496ed9d38979d393b6b70870c
Snapshot: docs/telemetry/n8-20261002-1740/replicate-i6b-r1-snapshot.json
Snapshot SHA256: 8392a20266ab30f4c256242eddb66c03cdc42ae601e1e2fddce9b9dff901be13
Frozen snapshot contains project-relative product_test_files path/sha256 entries,
original protected eight and 131 bindings, source/launch/spec/check hashes.
Check logs: replicate-i6b-r1-focused.log (retained red),
replicate-i6b-r1-focused-final.log (5/5), replicate-i6b-r1-syntax-final.log,
replicate-i6b-r1-static-final.log, replicate-i6b-r1-scope.log in this telemetry folder.

Companion preflight: not_applicable, runtime execution expressly reserved for parent.
Pending parent action: fresh Astra affected independent review <=3 minutes; no
reviewer launched by this sole-author unit. Parent I7 full mandatory suites and
canonical docs reconciliation, I8 actual Compose/PG16/shared browser validation at
1440/390 (legacy42 + hosted10 and unchanged disabled-payment followup). Confirm both
ordinary and held receipt digests match actual stored PG evidence. Real provider,
GPU geometry/performance/billing and activation remain separately gated. Provider
measurements remain null. No background process remains from this unit.

Status: completed
