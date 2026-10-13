# F03b correction R1/R2

Source: e7791cc57d60737e44eb7db33b3f06371dee7425. Review: review-b.md. Scope: R1/R2 only, inherited XL safety correction; mechanical route L exit1 remains a lower bound. Owner grants sole coder autonomy, no agents. Companion resume preserves RUN_ID and history; E2E preflight not_applicable (backend integration only).

R1: submit sampled the injected clock before eligibilityTransaction acquired advisory lock(7,1). The sample now occurs inside its callback after that lock, immediately before UTC day derivation. The same sample binds final lease, due, poll, retry, quota, deferral and token timestamps. PostgreSQL transaction-start now() is not used.

Four realPG regressions acquire the shared lock on a separate connection, assert actual waiting entries in pg_locks, advance a mutable injected clock, then release. Lease44.999→45s, poll59.999→60s with a live lease, and retry119.999→120s each assert zero final adapter calls. Two midnight waiters assert one submitted reservation on the new UTC day under provider limit1; the other becomes queued without reservation, due the following day. Existing stop races and boundary cases remain.

R2: both authenticated inspection GET routes reject disabled process mode with503/service_unavailable before calling readers. Auth still runs first; tenant predicates remain. A real authenticated HTTP test replaces both readers with counted failing functions and asserts503 and zero reads, plus unauthenticated401 for both routes. Existing local_test own200, intended-peer access, foreign-job404, invalid UUID400 and absent HTTP tick/live selector assertions remain; own messages200 is explicit.

Checks: repeated typecheck/lint and Docker build passed, unit14/14 passed; fullPG retry51/51 passed, including all new R1/R2 assertions. Initial typecheck TS7022 in new test fixed by explicit URL string type. Initial fullPG49/51 failed the unchanged F01 real-time HTTP rate-limit test (401 versus429), across a UTC-minute boundary; evidence preserved. Pre-lock clock mutant, restored affected suite, canary scan and final source/image snapshot are pending parent heavy regrant. The continuation acquired22:58:51 with grant present; grant removal was observed in control.md22:59:12. FullPG completed; mutation precondition rejected missing grant before any source change; lock released22:59:21. Both unsuccessful gates remain recorded.

Evidence prefix: docs/telemetry/features/20261002T211800Z-f03/sol-b-r1-*. Historical reviewer/author probes are preserved. Actual model/usage/cost null pending parent proof. No SMTP/IMAP/charge/browser/deployment/push; whole F03 acceptance requires fresh independent review.

Final delivery: correction verification FAILED because parent heavy grant remained withheld through the final delivery window. Clock-capture mutation, restored affected-suite rerun and fresh canary scan were not executed. Source never mutated; final read-only snapshot verifies all46 COPY inputs against own container with0 mismatches and records the exact image/build hashes. Successful fullPG51/51, unit14/14 and type/lint/build evidence remain valid. No full F03 acceptance claim; fresh independent review and outstanding verification remain required. Terminal receipt ends Status: failed; no silent extension.

## Subsequent coordinator verification

After bounded author completion, shared resource became available. Existing authored mutation/restore/canary/snapshot scripts completed under global flock, session98518 exit0, released23:08:35Z. All four old-clock boundary tests fail under mutation; restored31/31, canary and46hashes pass. See telemetry coordinator-b-r1-completion.md. Author failed receipt remains accurate for its own deadline; no silent extension. Fresh independent review pending.
