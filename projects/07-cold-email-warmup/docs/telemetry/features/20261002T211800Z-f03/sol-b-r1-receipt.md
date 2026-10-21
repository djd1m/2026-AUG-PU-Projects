# F03b R1/R2 correction receipt

RUN_ID: 20261002T211800Z-f03
WORK_UNIT_ID: n7-f03b-sol-r1
Attempt-ID: correct-b1
Source-Revision: e7791cc57d60737e44eb7db33b3f06371dee7425
Result-Revision: eef177f17a67ddd169430d5a01b7a32945937d9a
Build-Revision: eef177f17a67ddd169430d5a01b7a32945937d9a
Spec-SHA256: e215f1e53e89b42dccc35e8835209cba31b055f075212b82599fa61368af42be
Launch-SHA256: 6c7d8b0b70c6ab708aa1dcf7d79b3deac8943527f32bab67b1b32ec0551acaae
Started-At: 2026-10-02T22:52:26.803663+00:00
Finished-At: 2026-10-02T23:06:53.124825+00:00
Elapsed-Seconds: 866.321
Deadline: 2026-10-02T23:07:26.803663+00:00
Profile: compact-quality-first-v2, inherited XL safety correction; mechanical L exit1 is lower bound. Owner authorizes sole correction coder, no agents; companion resume applied. E2E preflight: not_applicable, backend integration only; actual PG checks retained.
Requested-Model: gpt-6.1-sol
Requested-Effort: high
Actual-Model: null
Actual-Effort: null
Usage: null
Cost: null
Missing measurements: parent host proof for actual model/effort/token usage/cost; active wall time unavailable. No invented counts or savings.

R1 moves authoritative injected clock into eligibilityTransaction callback AFTER shared advisory lock(7,1); UTC day and every final lease/poll/retry/quota/deferral binding derive from that fresh sample. PostgreSQL transaction-start now() is not substituted. R2 gates both authenticated dispatch inspection GETs on process-local_test authority before readers with503/service_unavailable; auth and tenant boundaries persist.

| Requirement / finding | Actual evidence / result |
| --- | --- |
| R1 AC-B1/B4/B5 lease45s | RealPG separate holder and proven waiter; clock44.999→45s; final0calls / pass |
| R1 poll60s | Actual waiter with live lease, clock59.999→60s; final0calls / pass |
| R1 retry120s | Actual waiter after trusted pre-DATA retry,119.999→120s; final0calls / pass |
| R1 midnight | Two actual waiters across UTC midnight; providerlimit1; one new-day submitted reservation, one queued/null reservation due following day / pass |
| R2 disabled jobs and messages | Exact authenticated HTTP routes503, zero counted reader invocations; unauth401 both / pass |
| R2 local_test isolation | Own job/messages200, intended-peer messages200, foreign job404, unauth401, invalid UUID400, HTTPtick404 / pass |
| Clock-capture mutant | NOT EXECUTED: parent heavy grant withheld through final delivery window |
| Restored affected suite / final canary | NOT EXECUTED: parent heavy grant withheld through final delivery window |

Commands and exits:

- bash ../../scripts/complexity-router.sh [three exact scoped files]:1, mechanical L; retained XL.
- Initial bash scripts/check-f03b-final.sh:2 (typecheck TS7022 in new URL initializer). Explicit string annotation applied; evidence sol-b-r1-heavy-attempt1.txt.
- Repeated npm run typecheck:0; npm run lint:0; docker build --cpu-period100000 --cpu-quota200000 -t n7f03b-web .:0 (npm run build0). Own-web stop, repository port-conflict check0 and own compose up --no-build --wait0; no other stacks changed.
- docker compose -p n7f03b exec -T web npm test:0,14/14.
- Initial full npm run test:integration:1,49/51. Unchanged F01 real-time rate test crossed UTC minute and returned401 instead of429; preserved in sol-b-r1-heavy.txt. New R1/R2 cases passed.
- FullPG retry npm run test:integration:0,51/51. Continuation overall1 because clock mutation precondition rejected missing grant BEFORE mutation; source remained unchanged. Evidence sol-b-r1-heavy-continuation.txt.
- python3 scripts/check-f03b-r1-snapshot.py:0, read-only initial and final snapshots;46 exact copied inputs,0 host/container mismatches. Required post-mutation snapshot unavailable because mutation never launched.
- git diff --check:0. Early Russian commit eef177f1; no CoAuthoredBy, no push.

Image: sha256:bb93d01382f53a6309d3d1c81389311d9e5195ee1df5d612081cfa8d3eda68a2
Copied-Input-SHA256: 68fbde78f1368d6878d8dccdf50f349baac1ef5db108fd839388c4a8a37395ad
Build-SHA256: 1579a6d613131263a5d40f28af0f2fa44687cf7ca094052493fed08db66215a3
Changed-source SHA256: submission.ts eb96188574f0660f254e3895e193097e6083618e12c765db227a85adde6449c7; server.ts 20158ecc5ecdce85e59ef6b868b6890885032d06bf94be3e87d4acdb1d332bb9; submission-integration.test.ts 7c3c684cf25dbed936e809b5e7a8a8231f24e1db08dc1558ed41dd70ef5c95be.
Exact per-file copied-input and compiled-build hashes: sol-b-r1-source-image.json (final read-only capture; mutation never launched, so no post-mutation restore claim).

Heavy actual intervals:22:55:41→22:55:46 (initial typecheck);22:56:10→22:57:24 (type/lint/build/unit/fullPG);22:58:51→22:59:21 (green fullPG retry, grant gate refusal). Shared flock held only for actual checks. Grant existed at continuation acquire; control removal observed22:59:12, mutation gate refused missing grant. No lock held while waiting for N8. CPU2 enforced on build/runtime; MemAvailable>=2500000kB and disk>=1500000kB checked before own-web replacement. Host dependencies reused from unchanged donor package/lock; hashes in sol-b-r1-unchanged-dependency-inputs.json.

Evidence and findings: correction-b-r1.md plus sol-b-r1-* only. Historical probes preserved; allocated launch/manifest caller-owned and unstaged. Unchanged dependency audit evidence reused as assessed by review-b.md; no fresh audit claimed. No browser E2E, real SMTP/IMAP, charge or deployment. Whole F03 acceptance remains dependent on fresh independent review; F04/F05/F06 outside scope.

Verdict: failed required correction verification: clock mutant, restored affected suite and canary unavailable because parent heavy grant remained withheld; no deadline extension
Status: failed
