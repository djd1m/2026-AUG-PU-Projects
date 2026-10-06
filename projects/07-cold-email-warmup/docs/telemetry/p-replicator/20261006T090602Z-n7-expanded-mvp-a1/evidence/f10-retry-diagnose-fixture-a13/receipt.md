# F10 retry diagnosis / F09 fixture A13 terminal receipt

RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT_ID: f10-retry-diagnose-fixture-a13
Launch-SHA256: da43c2b9f06ca72a4513d2f442072be8304fd710dc2e5da75eede5f40b9c69be
Source-Baseline: a8d4b6b2d46f1f45f27fe0a8028288057d0fa491
Result-Commit: 6255b8f19a456103f062b0d1d5fd2313b914af94
Worktree: /tmp/n7-f10-restart-fix-20261006-a12
Started-At: 2026-10-06T18:15:22.314072611Z
Source-Frozen-At: 2026-10-06T18:29:23.004754+00:00
Finished-At: 2026-10-06T18:30:46.768766+00:00
Duration-Seconds: 924.455
Profile: model-routing-econom, OWN-N7-006 product coding MEDIUM; approved F10 XL safeguards retained. No new product PLAN.
Requested-Model: gpt-6.1-sol
Requested-Effort: medium
Actual-Model: null (host execution metadata unavailable)
Actual-Effort: null (host metadata unavailable)
Usage-Tokens: null (host counters unavailable)
Cost: null (host counters unavailable)
Verdict: bounded diagnostic and authorized fixture correction completed; F10 acceptance remains incomplete.

Only product writes: tests/f09-transport-fixture.ts and tests/f09-live-transport.test.ts. Canonical fixture pair_key is sorted mailbox UUIDs plus post-query DB UTC date, matching PoolStore. Regression proves original random UUID fixture fails identity assertion; fixed fixture passes and malformed prior key still becomes cancelled/expired_pool_day before claim. Russian conventional commit; no Co-Authored-By. No runtime files changed: prior a8d4 runtime/five-file hashes and all73 compiled build hashes unchanged. Full current source120TS and build73 inventory sealed.

Two distinct diagnosed failure mechanisms:
1. HARNESS defect, deterministic no-I/O witness: old guard preload process.on('message') enabled IPC consumption before canonical listener registration. Delayed canonical receiver saw received:false while validator counted1. Authorized own guard v3 validates via before-dispatch process.emit wrapper, adding no early listener: same witness received:true/validated1. DNS/socket/missingfixture restrictions unchanged; original A11 guard untouched. Own output root only. Guard-SHA256: 0e40094d148dd350f2b007850093d75bd3f96e006d5f49a5cbe252a24b1d4e8b. Original own v2 SHA62b140748555f6ca9d5cdd4f6cb3c0a432906ba082bf7408e7a7b4df51640df1 retained.
2. PRODUCT retry trap, actual native TLS under corrected guard: participant with UID1 cursor0/high0/fixedtail0 gets reset EXAMINE UID2; imapRead rejects protocol_invalid before FETCH, signalAborted=false. Explicit ReplyStore.retry increments attempt/resets page budget but preserves UID1/tail0. After unchanged first30s provider backoff, quantum repeats same old-generation read, fails count2 and returns incomplete. Joined graceful restart retains hold. Control participant with newly captured UID2 failed intentionally tagged FETCH NO; explicit retry of same generation recovers after original30s backoff and completes after joined restart. Error class TransportFailure, allowlisted code protocol_invalid, messageSHA fa69d70b11e9d833f8b6bb83b7864c1c5ba6649e93308b53953d33f70af9964a; no raw error/provider text/body/secrets recorded. Exact causal states/events in diagnostic-classification-v1.json, diagnostic-summary-v3.json and child-error-v2.jsonl.

The small declared cohort is2active/2connected/2tenants, accelerated fault/restore/retry/restart~40s; canonical330Pass=false. Existing20pages/120s,30/60/120/300backoff and explicit retry authority preserved. No runtime correction or automatic retry, horizon reset, budget erasure, synthetic freshness, double-IO quantum, quota/stop relaxation. Original A12 native985 RED remains valid recorded result; original26participants cannot each be retrospectively attributed because the old raw receipt lacks per-rescan error/generation instrumentation. Do not claim all26 retrospectively proved one cause. Fresh corrected-guard diagnosis proves exact independent mechanisms rather than replacing historical evidence.

Checks/commands/exits (private env source /tmp/n7-f09-verify-a2/env.sh; DATABASE_NAME=n7f10_a2; fixtures assert DB before reset; NODE_OPTIONS --import own guard; CPU/heavy lock serialized):
- node own guard-negative-v3.mjs — exit0 for externalTCP/TLS/DNS+inheritedchild deny under both v2/v3.
- node own ipc-negative.mjs — exit0 missingfixture rejected before canonical listener under v2/v3.
- node --import tsx own guard-positive.mjs — exit0 actual numeric-loopback TLS stringfixture and bounded X509 BufferCA under v2/v3.
- node own buffer-ca-negative.mjs — exit0 empty/invalid/>65536-byte BufferCA rejected before listener.
- node own ipc-delivery-race.mjs under v2 — exit0 witness receivedfalse/validated1; same fixed-race script under v3 — exit0 receivedtrue/validated1.
- Diagnostic v1 source-copy and v2 compiled-copy — exit0 drain/safety assertion only, INCONCLUSIVE for provider cause: no effective canonical request,35s parent transport_timeout, signalAbortedfalse. Preserved raw logs, not product/native PASS.
- node --import tsx own diagnose-v3.mjs under corrected guard — exit0, actual localTLS/reset/FETCHNO/restore/explicitretry/backoff/join/restart causal witness; not330PASS. Scratch child copy logs sanitized errors only; source runtime unchanged.
- node --import tsx --test --test-name-pattern='native pool fixture uses canonical' tests/f09-live-transport.test.ts — original fixture exit1 (f09-fixture-baseline.tap), fixed exit0 (f09-fixture-fixed.tap).
- flock /tmp/codex-heavy-build.lock node --import tsx --test --test-concurrency=1 --test-name-pattern='transport grants|final live submission|UID reset|independent capacity|expired slot age|native pool fixture uses canonical' tests/f09-live-transport.test.ts — exit0,6/6 in53.513s, f09-native-current.tap. Covers grants, complete final eligibility/stop fences, UID atomic+recovery, independent capacity/consent predicates, expired-slot-age denial, canonical fixture. Does NOT run SIGSTOP120s.
- Final typecheck/lint/build under heavy lock — exit0, static-build.log. Unchanged A12 fullunit62/62 evidence retained without claiming fresh A13 fullunit or fullPG.

Readiness: diagnostic-preflight-v3.json and f09-native-preflight.json ready before actual native; exact guard/source/input/commands/effects/evidence recorded. Earlier readiness files retained with failed/inconclusive launch facts; readiness never PASS. Fresh exact statvfs before each heavy stage: diagnostic v3 3,447,894,016bytes/4,788,004inodes; current F09native3,446,235,136bytes/4,788,454inodes; staticbuild3,445,329,920bytes/4,783,430inodes. All>2GiB. Numeric127 loopback and exactPG192.168.176.2:5432 only. Own guard includes narrow bounded BufferCA certificate validation only in known slotowner IPC shape, no fixture bypass/network expansion. Every worker driver used runWorker(...,false,fixture) fifth argument.

Integrity: original A11 terminal53 and A12 raw32 artifacts unchanged (historical-integrity-final.json). No writes to main ledger/shared manifests/keys/root controls/original guards or historical evidence. No installs/new checkout/Docker start/UI/externalSMTP/IMAP/LLM/spend/push/deploy. Existing dependency symlink remains untracked. UI not_applicable: backend/native diagnostic only.

Process state: all exec sessions terminal, heavy lock released. owned-pids-final.json records 73 known diagnostic/native/probe/build PIDs, none present. First source-copy diagnostic did not log each child PID; runWorker settled joins plus physical occupancy0 assert confirm cleanup path, gap disclosed. Later compiled diagnostic has explicit child-entry PIDs. No hidden background work.

Next responsible executor: /root/n7_sol_coordinator. Parent explicitly reserved product read-result contract change for fresh Sol6.1 HIGH planner<=8min with normative packet/objective evidence, then exact MEDIUM coding scope. No runtime ownership added in A13. Proposed direction requires typed EXAMINE UID-generation-change result allowing guarded capture in one existing protocol quantum; current imap/adapter/worker sources need separately reviewed contract/caller handling. No implementation claim.

Unmet overall mandatory gates: planned UID-change retry correction; final-source corrected-guard330 strict all30 first/full/censored measurements; full realPG; physical SIGSTOP>120s plus DBfault/stale-proof controls; current material mutations/full canary; clean fork_turns=none HIGH independent review. No F10 acceptance. Exact next commands after approved plan/new frozen source and own readiness: NODE_OPTIONS='--import /tmp/n7-f10-verify-a13/guard-v3.mjs' node --import tsx --test --test-concurrency=1 --test-name-pattern='expired occupied slots' tests/f09-live-transport.test.ts; strict330: F10_EVIDENCE_DIR=<freshnextdirectory> NODE_OPTIONS='--import <validatednextguard>' node --import tsx --test --test-concurrency=1 tests/expanded-mvp-04.test.ts. These are pending command data, not running processes; future guard uses fresh own root and bound probes.

Raw SHA manifest: /tmp/n7-f10-verify-a13/raw-artifact-manifest-v1.json
Source/build/guard manifest: /tmp/n7-f10-verify-a13/source-build-final-v1.json
Runtime diagnostic classification: /tmp/n7-f10-verify-a13/diagnostic-classification-v1.json

Status: completed
