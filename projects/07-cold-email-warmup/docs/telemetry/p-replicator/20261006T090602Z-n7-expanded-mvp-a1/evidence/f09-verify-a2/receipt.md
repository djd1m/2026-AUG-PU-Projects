# F09 A2 terminal implementation and verification receipt
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT_ID: f09-verify-a2
Attempt: f09-verify-a2
Baseline: 6ec4fe8cbbb013e64902f90f5c08000498fe7aff
Source: 35039ad32e933d7a4d0bf0f7621f7722e5774ef6
Result-source: 35039ad32e933d7a4d0bf0f7621f7722e5774ef6
Spec-SHA256: 6e10f17fd5373c92a8725d6298827265f6b5082d8c37bba45777c3d7a7a756e9
Launch-SHA256: a5811a9b003a6f890eced235d3ef2291f8dd2207bf2624cf73d20654c98b8292
Started-At: 2026-10-06T13:31:23.416017+00:00
Finished-At: 2026-10-06T13:51:51.756332+00:00
Duration-seconds: 1228.340315
Bound: 2026-10-06T13:51:23Z; source frozen at13:49:19, no source changes afterward
Profile: compact-quality-first-v2
Requested-model: gpt-6.1-sol
Requested-effort: high
Actual-model: null (host_not_exposed)
Actual-effort: null (host_not_exposed)
Usage: null (host_not_exposed)
Cost: null (host_not_exposed)
Verdict: failed/partial mandatory verification pending; not accepted F09

A1 historical sealing overrun was48.763 seconds; previous phrase few seconds was inaccurate and is corrected here. Historical A1 stays failed.

Source binding: all-source-manifest.json SHA256=77bde2644ee0693ec5409ac804cc88fa3eb078d974bdce108bd53dd067f52ff0; accepted-source-manifest.json records12 A2 changes. Build manifest=b78970328854ce81158f8338a013a47898b287cd33fef5d3af497f9d96b326bb; Node runtime-version.log confirms22.20.0. Initial final-manifest path script failed because git returns repository-relative paths; artifact-only repair uses actual repository root and committed source. This artifact failure is disclosed, not a product check failure.
Sole final source change after final test launch was unused test import removal; logic unchanged. Final type0/build0 precede this import-only correction. Original lint1 remains historical until actually completed corrected rerun. No global config/deps/UI/canon/telemetry/publicroute/provider/spend/deploy/push.

Concrete defects fixed:
- Slot proof now requires same allocated identity and bound exact ChildProcess; live child and reconstructed/orphan/crosshost identity cannot prove closure. Every proof seals against a later bind/I/O. Release uses exact operation/process/host CAS, with occupied expired slots retained.
- Live poll capture/page guard rechecks grant revision, mailbox revision and DB-current expiry; live mode with local fixture adapter returns paused.
- Live accepted receipt records parsed acceptance time. Invalid/oversize privileged grant files go through expected-revision revocation.
- A2 tests distinguish grant/operator/expiry/revision isolation, campaign/pool sender+recipient consent/capacity/grant/poll/quota/stop fences, retry/message identity, awaited final SQL cancellation, page crashes, replay and framing faults.

Evidence:
- sigstop120.exit0: real local6 TLS sockets,2SMTP/4IMAP and1/protocol/mailbox; owner SIGSTOP past actual120s; lease expiry denied new admission; pending SIGTERM without exit denied proof; exact SIGKILL exit enabled CAS release; failed DB release retained occupancy then exact proof retry; stale acknowledgements and reconstructed/orphan/crosshost identity denied; normal child exit closed remaining sockets. Test123552.683ms, full node124133.625ms.
- physical-component-composition.json proves captured/final slot module, owner fixture and physical test function byte hashes identical. Captured entire early fixture prefix SHA matches6ec4 baseline actual bytes; final relevant stall branch identical; later optional non-stall protocol behaviors differ and are covered by final protocol run. No repeat120s for comfort; no simulated-time witness substituted.
- pg-coverage2.exit0:3/3 distinct cases; final F09+literal parent f09-pg-final.exit0:6/6,51273.985ms. Additional capacity/consent predicate and expiry-age tests included.
- protocol-faults.exit0:11/11; final protocol adds explicit8193 receive-line test. See actual protocol-final.exit/log.
- Nine mutations each returned1(red), both harnesses0 and exact original bytes restored: DATA ambiguity, UID generation, receive limit, TLS hostname, grant revision, page commit atomicity, capacity+consent predicates, expiry reclaim, exact live-child proof. JSONs/logs/exits retained. Expiry mutation fast guard complements actual120s witness; physical proof mutation fails before sleep.
- Credential AAD/tamper produces zero sockets; plaintext/base64 AUTH canaries absent from typed outcomes and storage metadata. log-canary-scan.json scanned27 logs including actual runtime secret values without output;0 hits. Final ongoing logs require rescanning after they finish.
- All previous source fixes/first-red findings preserved in logs, including test import/FK mistakes and original unused-import lint.

Actual exits at sealing:
{
  "f09-pg-final.exit": "0",
  "sigstop120.exit": "0",
  "typecheck-coverage2.exit": "0",
  "protocol-final.exit": "0",
  "mutation-grant-revision.exit": "1",
  "diff-check.exit": "0",
  "mutation-capacity-consent.exit": "1",
  "pg-coverage-first.exit": "1",
  "typecheck-faults.exit": "0",
  "mutation-page-atomicity.exit": "1",
  "typecheck-final.exit": "0",
  "mutation-uid-generation.exit": "1",
  "full-pg-final.exit": "0",
  "mutation-child-proof.exit": "1",
  "mutation-body-ambiguity.exit": "1",
  "mutation-pg-run.exit": "0",
  "protocol-faults.exit": "0",
  "mutation-tls-hostname.exit": "1",
  "lint-final.exit": "1",
  "mutation-expiry-reclaim.exit": "1",
  "typecheck-early.exit": "0",
  "mutation-receive-limit.exit": "1",
  "pg-coverage2.exit": "0",
  "mutation-run.exit": "0",
  "build-final.exit": "0",
  "typecheck-coverage.exit": "2"
}

Pending mandatory exits: ["full-unit-final.exit", "lint-corrected.exit"].
Active own final command is explicitly handed off, not counted as passed: session1982; processes=[{"pid": 336175, "ppid": 124366, "command": "bash /tmp/n7-f09-verify-a2/run-final.sh"}]; running-process-handoff.json binds exact source and command. Coordinator explicitly authorized preserving ongoing unchanged checks instead of stopping/restarting them at bound. Database n7f09_a1 exclusively, before-reset current_database guard; default n7 untouched. No parallel PG suites. Heavy mutex maintained.

Required next bounded continuation:
1. Collect ongoing full PG, full unit and corrected lint actual exits at same frozen source; inspect concrete failures if any. Do not restart successful unchanged checks.
2. Complete final log canary scan and source/build manifest comparison after command exits. All9 AC unaccepted until mandatory complete9 source-bound verdict assembled.
3. Fresh independent Astra review on exact source/spec and final evidence; coordinator owns canon/telemetry reconciliation and accepted-result integration. Review not run in this author attempt.

Status: failed
