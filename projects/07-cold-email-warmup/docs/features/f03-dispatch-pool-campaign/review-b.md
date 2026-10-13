# F03b independent review

Verdict: REQUEST_CHANGES

Source: `8c18322417181d7295e49ea56d0689b8d55c617b`; reviewed B diff `1c05004e..HEAD` and its dispatch/stop-writer interactions. F03a remains accepted; this review does not reopen its unrelated repaired race. Whole F03 cannot be accepted until B passes. F04/F05/F06 remain pending, with public unsubscribe/IMAP consumers and full cabinet UI explicitly outside this slice.

## Confirmed findings

### R1 — P1: final authority uses the timestamp from before lock acquisition

Location: `src/dispatch/submission.ts:19` (used at lines23–39 and42–45); `src/consent/transaction.ts:5`–7.

`submit()` samples `this.now()` before `eligibilityTransaction()` acquires a client and waits for lock(7,1). After the wait, every temporal predicate and the quota date still use that old `$1`/`$4`. The lock correctly serializes row changes, but does not refresh the clock.

Concrete triggers, with all other guards valid:

- A claim is live at12:00:44.999, expires12:00:45, and acquires the lock at12:00:45. The UPDATE still sees a live lease.
- A complete poll is59.999s old before acquisition and60s old afterward. The final predicate still permits it. A fresh claim can have been taken20s after that poll, so lease expiry need not confound this case.
- A retry starts at first-attempt+119.999s and obtains the lock at+120s. It can still enter submitting and call the adapter despite the retry ceiling.
- A pending final transaction samples23:59:59.999 and acquires the lock after00:00. It retains the previous-day reservation and counts previous-day capacity. With provider limit1, this send is uncounted in the new day, allowing another new-day claim/send beyond that day's limit.

Violates AC-B1, AC-B4, AC-B5; Pseudocode dispatch3/6; safety-v1 live lease, poll freshness, retry ceiling and current UTC quota; SC-US-005-5/6 and006-5.

Evidence: `astra-b-clock-probe.cjs` and `.json` under the run directory execute the exact transaction body and submission SQL prefix against a mocked client that advances the injected clock when lock acquisition completes. Exit0 confirms all four stale bindings, including `boundDay=2026-10-02` with post-lock time `2026-10-03T00:00:00.000Z`. This is a source-derived control-flow probe, not a claimed realPG reproduction or adapter-call measurement. The defect also follows directly from the immutable Date captured at line19 and bound at line39.

Minimal fix: sample the authoritative clock inside the eligibility callback, after the shared lock has been acquired, immediately before deriving the UTC day and executing the conditional UPDATE. Use that same fresh sample for lease, poll, retry, quota and deferral. Do not replace it with PostgreSQL transaction-start `now()`, which can likewise predate the wait.

Required regression: use a separate realPG connection holding lock(7,1), start submission until it is demonstrably waiting, advance the injected clock across each boundary, then release. Expired lease, age60s and retry120s must produce0 calls. For midnight, concurrent final attempts must use the new day and obey provider limit1; inspect reservations. Existing tests at `tests/submission-integration.test.ts:129`–169 set time before invocation; their lock races at82–90 never advance time during the wait, so neither catches this combination.

### R2 — P2: disabled mode still exposes test state inspection

Location: `src/server.ts:99`–103; `src/dispatch/submission.ts:94`–100.

Trigger: start with default `DISPATCH_MODE=disabled` and issue an authenticated GET to `/api/dispatch/jobs/<owned-job>` or `/api/dispatch/messages`. Both routes unconditionally call the readers and return200; the latter even labels its response `local_test`. Neither the route nor reader checks dispatch mode. Authentication/tenant filtering remains correct; this finding is specifically the missing mode restriction.

Violates AC-B5: “State inspection and operator test tick are scoped to local test mode.” The CLI tick and submission gate enforce that restriction; the new inspection routes do not.

Evidence: direct source inspection plus `astra-b-disabled-read-probe.cjs`/`.json`, exit0. The probe executes the actual route block (removing only TypeScript non-null assertions) with an authenticated fixture identity, disabled config and stub readers: both return200 and invoke a reader once. No HTTP socket or database was used. Existing HTTP assertions at `tests/submission-integration.test.ts:104`–120 run exclusively with local_test config.

Minimal fix: gate both test inspection routes on process-configured `dispatchMode==='local_test'` before reading, with an explicit unavailable response in disabled mode. Preserve session/tenant checks and process-only authority; never take mode from HTTP input.

Required regression: authenticated disabled-mode requests to both endpoints must be unavailable and read no test records; local_test must retain own200, intended-peer message access, foreign-job404 and unauthenticated401. Retain no HTTP tick/live selector.

## Six-AC matrix

| AC | Result | Source and assertion assessment |
|---|---|---|
| B1 | REQUEST_CHANGES — R1 | Shared lock is first DB operation after BEGIN; conditional UPDATE checks claimed state, owner, consent/version/fingerprint, campaign/enrollment/suppression, both pool parties, eligibility/quarantine, complete poll and min(user,provider,30). Excludes own reservation correctly and moves/defers atomically, but time/day is stale after a wait. |
| B2 | ACCEPT | All10 real production writers appear in tests55–71; both barrier orderings74–93 use a separate PG lock holder and assert an actual waiter, before0/after1, same-job later0 and later claim=null. Commit/release precedes adapter I/O at submission67–72. Existing A claim_order rotation is retained. |
| B3 | ACCEPT | Random32-byte unsubscribe capability/hash binding, body link, both one-click headers and per-render UUID Message-ID. Migration005 persists sink/token data; tests94–127 inspect actual content, references, second-pool persistence, owner/peer/third-party isolation and private campaign exclusion. Whitelist at submission100 omits tenant identifiers and credentials. No real connection or inbox/reputation claim. |
| B4 | REQUEST_CHANGES — R1 | Typed trusted pre-DATA proof only;5/30 delays and max3 attempts; permanent failure terminates. Ambiguous/throw/invalid proof/crash becomes unknown_delivery with quota retained and no resend; recovery never invents proof. Those paths are asserted153–175, but the pre-lock clock can admit a retry at/after120s. |
| B5 | REQUEST_CHANGES — R1, R2 | Existing exact poll/lease/retry and concurrent midnight assertions are meaningful but omit time advancing during lock acquisition. Default disabled/live rejection and operator-only tick are correct; state inspection lacks its required local_test gate. |
| B6 | REQUEST_CHANGES — dependent on R1/R2 | Recorded fullPG46, restored B26 including20 stop races, unit14, final mutation, type/lint/build and security/audit are valid evidence for their asserted cases. Fresh independent review is complete and identifies the two failures above; corrections and affected regressions are required before acceptance. Deferred F04/F06 absence is not a finding. |

## Evidence and limits

Local SHA256 comparison (exit0) verifies all46 recorded image inputs against this worktree and donor `cb5821f567912bfd2377cd2ec76bac29e1be2f95`, with0 mismatches. Spec and allocated launch digests match the assignment. See `astra-b-source-evidence.json`. Recorded image: `sha256:e2f5be561b7b86e52897be2758eda38669b96038d180ea955aa5dfa2e69dd1dd`. No runtime access was needed.

Read the concrete test assertions and named results in `sol-b-final-checks.txt`, `sol-b-heavy-r1.txt`, `sol-b-mutation.txt`, `sol-b-secret-scan.txt` and author receipt. Final freshness mutant fails `poll 60000/true`, expected0/actual1, mutant exit1; restored source matches the image evidence. Initial tuple TypeScript failure and missing heavy-grant interruption remain recorded, not rewritten as passes. Final whitelist/HTTP-test changes have fresh build/fullPG evidence. Unit/audit reuse is supported by unchanged bound inputs.

Reviewer ran only read-only source/hash analysis and two focused in-memory probes; no green suites, build, DB mutation, browser, network, mail, charge or secret access. Product bytes, old reports and allocated launch/manifest are preserved. The route probe initially failed parsing a TypeScript non-null assertion (exit1); removing that type-only syntax from the extracted in-memory block yielded exit0. This was a probe preparation correction, not a product fix.

Profile: compact-quality-first-v2, independent high-risk review (inherited XL). Requested model/effort: Astra high; actual reviewer model/effort/usage/cost: null pending parent host proof. Author host evidence in sol-b-runtime.json records gpt-6.1-sol/high; those usage counters are not attributed to this reviewer.

Started-At: 2026-10-02T22:37:24.686802+00:00
Finished-At: 2026-10-02T22:44:52.671849+00:00
Elapsed-Seconds: 447.985
Deadline-Variance: terminal delivery27.985s after420s target, within480s hard limit; report composition overrun.
Receipt: docs/telemetry/features/20261002T211800Z-f03/astra-b-receipt.md
Status: completed
