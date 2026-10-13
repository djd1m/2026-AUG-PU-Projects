Verdict: **Bounded confirmed fixture correction completed; parent browser E2E pending.**

`drive(payment, id)` now waits for the specified fixture intent's own provider
binding before signaling success. The adjacent helper rereads that intent around
queue passes, tolerates an active target lease, and never clears leases or binds
a different intent. It allows at most 100 passes, a 10-second monotonic readiness
deadline and 50-ms delays. Missing, terminal, invalid-mode and exhausted targets
fail explicitly. Production web/payments/provider/ledger and manifests are
unchanged; the original dedicated fixture ownership guards remain intact.

```text
Run-ID: n8-20261002-1740
Work-Unit-ID: n8-ui-payment-fix
Attempt-ID: n8-ui-payment-fix-1
Source-Revision: b2423353b53fc7986ce7c3df2902a76439dddb2a
Launch-SHA256: de1a1844d2870f7d33c8469a5d3b3b98cb34dabead82bbca9288a1af215b61bb
Build-Revision: 22c0f81bf478890755ca641a2881d2135b268796219697bad659f8541238dd2e
Started-At: 2026-10-03T02:00:14Z
Finished-At: 2026-10-03T02:08:04.410369+00:00
Elapsed-Seconds: 470.410
Budget-Seconds: 600
```

Changed source files: `scripts/ui/fixture-driver.js`,
`scripts/ui/payment-ready.js`, `tests/ui-payment-fixture.test.js` in
`projects/08-interior-ai-redesign`. Source comparison covers 85 files and confirms
exactly these three changes. No commit was made; parent integration owns it.

| Check | Result |
|---|---|
| `node tests/ui-payment-fixture.test.js` | Exit 0; all 10 local simulation tests pass |
| One-pass behavior mutation | Exit 1; fails the target-readiness assertion; original bytes restored |
| `npm run build` | Exit 0; ESM/static syntax build |
| `git diff --check` and source scope/hash verification | Pass |

Node: `v22.22.3`; PATH starts with `/tmp/n6b-f06-node22/bin`.
Regression covers a preceding intent, temporarily leased/not-ready target,
exact-target signaling, missing/terminal/binding failures, finite tries and
late readiness after deadline. An intermediate restored run failed because the
local test config lacked existing budget limits; that config was corrected and
the final checks passed. No unresolved check failure remains.

Evidence: `projects/08-interior-ai-redesign/docs/features/ui-payment-fix/`:

```text
checks.json SHA256: 93f815f70753c057e630b3ee0987127855afe201aee124349ab757dc98871719
source-snapshot.json SHA256: 0d28cdd39bbfbcddfb0cdbee464a5d7f1ca5d38dabd4be0a7c59fb036e782121
progress.json SHA256: 135f0f5a1e495da27c7f95cce02f7912c53edebbd01109462248003d0dcea5b8
```

Profile: `compact-quality-first-v2`; route S for the explicitly bounded local
fixture correction, mechanical exit 0. Requested model/effort:
`gpt-6.1-sol` / `high`; actual provider-resolved model/effort: `null` (unavailable).
No delegation, model switch or fallback. Usage, cost and active time: `null`;
no measured usage/cost is exposed by this worker host.

Limitations: tests inject local queue/clock/signal behavior and provide no
browser or real PostgreSQL race acceptance. The readiness deadline does not
cancel an in-flight database/worker operation. Actual browser E2E and independent
review are pending the parent, outside this worker's authorized scope. No Docker,
external calls, installs, secrets, other-project edits or global changes were
used. Raw logs stay under `/tmp/n8-ui-payment-fix`; launch digest was verified.

Trace: `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-ui-payment-fix/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-ui-payment-fix-receipt.md`. Receipt installed atomically at this unique, previously absent
path; parent owns aggregate telemetry and the existing companion work record.

Status: completed
