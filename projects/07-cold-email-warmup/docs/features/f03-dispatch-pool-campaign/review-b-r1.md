Verdict: ACCEPT
R1: CLOSED. R2: CLOSED. No remaining correction-scope defects found.

Reviewed source `55fffed2ce51a109fe09bc645e36493f6ce3424f`, correction diff `e7791cc5..HEAD` only: submission.ts, server.ts, targeted tests/scripts and associated evidence. F03a stays accepted and unchanged; prior accepted B scope is not reopened. F04/F05/F06 remain pending outside this review and are not findings.

Exact acceptance clauses from `01-specification.md:41`, `:56`, `:59`:

> AC-B1: fresh transaction takes same lock(7,1) FIRST and conditionally updates
> claimed→submitting after job/lease owner, current sender consent/version,
> enrollment/suppression, campaign state/version, mailbox/quarantine, pool recipient
> eligibility, complete poll age0<=age<60s and operator test/live gate checks.
> Move prior UTC-day reservation atomically to current day or defer when full.

> AC-B4: typed proved pre-DATA transient failure only: max3 total attempts within
> 120s, delays5/30, all current guards and quota rechecked. Ambiguous timeout/crash
> after submitting=>unknown_delivery, quota retained, zero automatic resend.

> AC-B5: deterministic clock boundaries include midnight with provider lower limit,
> 59.999/60/future poll time, lease expiry,120s retry ceiling. State inspection and
> operator test tick are scoped to local test mode; server authority remains intact.

R1 closure: `src/consent/transaction.ts:7` awaits the shared advisory lock before invoking the callback at line8. `src/dispatch/submission.ts:24` now samples the injected/current clock inside that callback, after the wait and directly before deriving day. The same sample binds lease/due/retry/first-attempt/submitting timestamps at lines27–30/41; both sender and pool-recipient poll predicates interpolate `freshMailbox` using `$1` (`src/dispatch/eligibility.ts:2`); quota reservation/count use the derived `$4` at lines26/39/41. Deferral uses the same fresh sample/day at lines44–47 and token expiry at line67. No PostgreSQL transaction-start clock replaces it. Existing commit-before-adapter ordering at lines69–74 remains intact; outcome time at line78 is separately sampled after its own lock.

The regressions are substantive realPG barriers. `tests/submission-integration.test.ts:20` checks ungranted advisory locks; lines56–65 hold lock(7,1) on a separate connection, launch submissions, require the expected waiter count, advance the shared mutable clock, then release. Midnight requires two actual waiters. Tests are sequential in the isolated recorded suite; these are not sleep-only or mock-lock assertions.

| Boundary | Source assertion and isolation of cause | Result in recorded restored suite |
| --- | --- | --- |
| Lease | tests/submission-integration.test.ts:161: 44.999→45s, both returned and counted adapter calls zero | PASS |
| Poll | tests/submission-integration.test.ts:166: 59.999→60s; claim taken at +20s gives live lease through +65s, isolating poll staleness | PASS, zero calls |
| Retry | tests/submission-integration.test.ts:171: trusted pre-DATA first result, refreshed poll and reclaimed lease, 119.999→120s | PASS, zero final calls |
| Midnight | tests/submission-integration.test.ts:180: two live claims, fresh poll, provider limit1; 23:59:59.999→00:00 | PASS: one call and one submitted reservation on Oct3; other queued with null reservation, due Oct4; claim order retained |

R2 closure: `src/server.ts:100` and `:105` return503/service_unavailable for disabled mode before either inspection reader. Authentication remains earlier at lines70–73, so unauthenticated requests remain401. Authority comes from process config. Existing tenant predicates in `src/dispatch/submission.ts:97` and `:102` are unchanged. `tests/submission-integration.test.ts:142` uses real sessions/HTTP and counted throwing readers: both disabled routes must return the exact503 body with zero reads, and both unauthenticated requests return401. Existing local_test assertions at lines125–140 retain own job/messages200, intended-peer messages200, foreign-job404, invalid UUID400, private campaign isolation, and absent HTTP tick. No HTTP-controlled mode selector was introduced.

Mutation and restoration: `scripts/check-f03b-r1-clock-mutation.py:9` reinstates precisely the pre-lock clock capture. It runs the actual source through tsx, requires nonzero exit plus assertion output and all four named failures (lines14–18), then restores original host/container bytes in finally and verifies their hash (lines20–25). `sol-b-r1-clock-mutation.txt` records exit1: lease, poll and retry each admit1 instead of0 calls; midnight has0 instead of1 submitted reservations on the new day. TAP reports5 failures because the parent fails along with the four subtests, not because of a fifth independent defect. Restored `sol-b-r1-coordinator-completion.txt` records31/31 passing, zero failures/skips, canary pass and final snapshot pass. Thus the tests demonstrably detect the old bug and pass after restoration.

Evidence chronology is preserved. `sol-b-r1-receipt.md` accurately ends failed: its bounded author attempt could not finish mutation/restored-suite/canary gates while the shared heavy grant was unavailable. The successful51-test continuation still exited1 when the mutation precondition rejected the missing grant before changing source. Author process exit0 is not a verification pass. Its receipt finished23:06:53; host runtime ended23:07:20. Subsequent `coordinator-b-r1-completion.md` records mechanical execution of existing authored scripts, session98518 exit0. The actual log interval is23:07:55–23:08:35 UTC, after the author ended; use this rather than the rounded23:07:57 prose. Product bytes did not change. This later, separately attributed evidence closes the missing gates without rewriting the failed receipt or treating it as an extended author attempt.

Initial failures also remain visible: `sol-b-r1-heavy-attempt1.txt` contains TS7022 in the new URL initializer, corrected by the explicit string annotation at test line153. `sol-b-r1-heavy.txt` retains the initial49/51 fullPG result, including unchanged F01 rate-fixture401 versus429. The author attributes this to a UTC-minute boundary; that cause is reported attribution, not a fresh runtime diagnosis here. The fullPG retry passes51/51 in `sol-b-r1-heavy-continuation.txt`. Typecheck, lint, build and unit14/14 pass in `sol-b-r1-heavy.txt`; the build produces image bb93d01382f5. Canary completion is evidenced by the later coordinator log; no fresh reviewer security scan is claimed. Dependency audit reuse remains the prior accepted unchanged-input evidence.

Independent read-only SHA256 verification exited0; see `../../telemetry/features/20261002T211800Z-f03/astra-b-r1-source-evidence.json`. All46 copied inputs match this worktree, source HEAD, product donor `eef177f1` and evidence donor `599bf9e8`, with zero mismatches. The copied-input inventory, Dockerfile, copied/build aggregate hashes, restored submission hash and pre/post-mutation input/build/image equality all match. Source/launch/spec identity is verified. Image/container evidence identifies `sha256:bb93d01382f53a6309d3d1c81389311d9e5195ee1df5d612081cfa8d3eda68a2`; copied aggregate `68fbde78f1368d6878d8dccdf50f349baac1ef5db108fd839388c4a8a37395ad`, build aggregate `1579a6d613131263a5d40f28af0f2fa44687cf7ca094052493fed08db66215a3`. Runtime/container truth is assessed from the supplied source-bound snapshots and logs, not independently queried.

AC-B1/B4/B5 corrections pass. Existing accepted B2/B3 and unchanged A stand; B6's correction verification and fresh independent-review dependency are now satisfied within this slice. No approval of pending F04/F05/F06, live transport, deployment or broader runtime readiness is implied.

Reviewer performed source/evidence reads and local hashes only: no tests/build/DB/browser/network/secret access, agents, commits, pushes or product edits. Only this report, its receipt and new astra-b-r1 hash evidence were written. Historical evidence and allocated launch/manifest are preserved. Companion prepare applied; substantive route remains inherited XL (recorded mechanical L is a lower bound); no new router or E2E execution in this source-only review. Profile: compact-quality-first-v2. Requested model/effort: gpt-6-astra/high; actual model/effort, usage and cost: null pending host evidence. Author host evidence separately records gpt-6.1-sol/high; its usage is not reviewer usage.

Started-At: 2026-10-02T23:10:46.155639+00:00
Finished-At: 2026-10-02T23:15:36.822468+00:00
Measured-Wall-Seconds: 290.667
Receipt: docs/telemetry/features/20261002T211800Z-f03/astra-b-r1-receipt.md
Status: completed
