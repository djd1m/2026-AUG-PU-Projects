# F04a corrected-source independent review R1

Verdict: ACCEPT

All six AC-A1..A6 accepted on corrected source `aef86f201f79605286d7a66c22d6d94228e216db`, correction diff `40623e0e..HEAD`. This fresh review owns this verdict. The original `review-a.md` was substantive but delivery failed: its receipt was absent, so it supplied no acceptance. F03 remains accepted. Entire F04 remains pending F04b public handlers/poll worker; those exclusions are not findings.

## P1 closure

The original counterexample is closed: original H=10, captured tail horizon111, first100 headers at UIDs11..110, matching reply at111. [store.ts](../../../src/replies/store.ts#L103) now preserves original H, captures `tailHighWater` with the first accepted tail page, and requires the same horizon on subsequent pages and retry. [input.ts](../../../src/replies/input.ts#L34) requires a bounded horizon and rejects coverage beyond it. Completion requires `coveredThrough === tailHighWater`, independently of header count. Effects, horizon, cursor, page budget and completion share one transaction; incomplete coverage preserves the previous completion timestamp.

The production-store PG regression at [tests:141](../../../tests/replies-integration.test.ts#L141) asserts observations100/effects0/cursor110, poll incomplete, unchanged freshness, DispatchStore claim null and SubmissionStore adapter calls0. UID111 then yields effect1, replied enrollment and atomic completion. It also checks new incremental run/horizon reset and old callback rejection. [Tests:168](../../../tests/replies-integration.test.ts#L168) distinguish equal-cursor empty partial and sparse partial coverage from genuinely empty complete tails; reject both lowered/raised horizons and wrong validity; and preserve run/H/cursor/horizon through failTail, retry and capture999. No remaining P1 counterexample or required code fix was found.

## Six-AC matrix

| AC | Result | Independently inspected basis |
|---|---|---|
| A1 | PASS | Input bounds100/8192/50/254, UID/validity and single-sender/ID normalization; unknown header fields/body rejected. Own tenant/mailbox sent-reference query plus decrypted recipient comparison; no subject matching. PG tests56–74 assert wrong sender/foreign/unrelated0, missing/malformed IDs still match, and reused incoming ID permits a distinct effect. |
| A2 | PASS | `eligibilityTransaction` takes lock(7,1) immediately after BEGIN. Migration006 separates observation, incoming-ID ledger and semantic-effect uniqueness. Unchanged `ingest` gates shared stop helper on INSERT RETURNING; helper preserves stopped enrollment states and submitting jobs. Tests91–95 assert concurrent duplicate rejection, one effect/page, two observations/IDs. |
| A3 | PASS | Capture preserves unfinished run/H; reset creates cursor0 and clears horizon without altering quarantine. Current run/attempt/validity/cursor checked under lock. Tests97–111 cover empty/sparse ranges and a real advisory-lock second-reset race; stale page/tail/failure callback cannot finish the new run. No progress-only freshness. |
| A4 | PASS | Tail horizon closure above. Retry updates only attempt budget/state. Tests113–139 verify twentieth unfinished page, explicit retry, exact120s after lock wait, future clock and failed/future/slow tail pause, and post-lock completion timestamp. Existing budget conditions remain unchanged. |
| A5 | PASS | Tests76–89 inject BEFORE and AFTER COMMIT: resume same run/H despite capture999, cursor2 versus10, effects1 versus2 and observations1 versus3; replay ends R1/S1. Production ingestion tests194–205 use beforeFinal/afterCommit barriers and actual advisory waiting, assert adapter0/1 then later0 and pending cancellation. New partial-tail test proves both claim/submission blocked. Unchanged F03 freshness assertions cover59.999/60/60.001s, future and incomplete evidence. |
| A6 | PASS | Additive007 registers migration/readiness;006 byte-unchanged. Saved type/lint/build, unit16/16, full PG66/66, restored PG15/15, canary/secret and audit gates pass. Source-bound mutation and hashes verified below. Internal trusted B interface documented; no public ingestion/live-provider claim. This report and unique terminal receipt deliver the fresh review. |

## Evidence and limits

`sol-a-r1-heavy.sh` uses fail-fast execution; saved harness exit0 and TAP summaries substantiate the gates. The tail mutation changes only the completion predicate to unconditional tail-complete. Saved mutant exit1 fails the new assertions at tests151 and170; finally restores host/copied source, whose SHA matches the current store. The affected suite then passes15/15. The original semantic-dedup mutant produced actual3 versus expected0 at test69; the relevant ingestion block is unchanged and its assertions pass the corrected full regression.

Local SHA checks verify **52/52** source inputs against worktree, product/build donor `d869e64f29a673614f3032f53118a717418bb8af`, and recorded copied inputs. Evidence donor is `e25cde1f683a1608f0ae556578b651c9af3f8b17`. Source aggregate `bf2e05e510128c9a0ae4d015b6686ba93471d7a956ce7946a891fb8185255e80`; recorded30-file build aggregate `1d8ce1b43ac566444fc5eeff15ecd6d284863a423879a30e834e21c9a2cbf109`. Recorded image/container ID agrees: `sha256:83149eaf54020cf8dedcec267848d114ea02ef0f77d779fd21c21bcb9619c94a`. Snapshot harness comparisons were inspected; runtime/build bytes were not freshly accessed.

Spec SHA `6deaa2f48d531ca66b71abb9f1b90794836cc4ab80eab557076863b92de74a38` and launch SHA `7db307073ea86709cf685f92f2c01834e50fc703df82f59f4d1c520e13657b4e` verified. Canonical FR-n7-006, safety-v1 and ingestion algorithm were read directly, as were the original report's crash/dedup/stop assertions.

Profile `compact-quality-first-v2`, inherited XL; single lane, no agents. Author actual `gpt-6.1-sol/high` is recorded by `sol-a-r1-runtime.json`. Reviewer requested `gpt-6-astra/high`; actual model/effort, usage, cost and active-time partition remain null pending host evidence. No suites/build/DB/browser/network/secrets, source changes, commits or pushes. Launch/manifest and historical evidence remain unchanged.

Measured elapsed to terminal artifacts: 175.205s. Telemetry: [receipt](../../telemetry/features/20261002T232200Z-f04/astra-a-r1-receipt.md) and [local evidence](../../telemetry/features/20261002T232200Z-f04/newastra-a-r1-evidence.json). Savings are not established.
