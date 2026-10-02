# F03b implementation receipt
RUN_ID: 20261002T211800Z-f03
WORK_UNIT_ID: n7-f03b-sol
Attempt-ID: implement-b1
Source-Revision: 1c05004e47a245c953a359c89525487e2be79456
Spec-Path: docs/features/f03-dispatch-pool-campaign/01-specification.md
Spec-SHA256: e215f1e53e89b42dccc35e8835209cba31b055f075212b82599fa61368af42be
Launch-SHA256: 20b52394bfe38d2e6007d7686a75b16d431e79c3724f392d643a7038434baaa4
Profile: compact-quality-first-v2; owner-approved sole Sol6.1 high author, no agents.
Actual-Model: null (pending host metadata)
Usage: null; Cost: null (host not supplied)
Process-Started-At: 2026-10-02T22:13:21.185Z
First-Observed-At: 2026-10-02T22:13:33Z (tool date -u; host monitor separately reported22:14:37)
Hard-Deadline: 2026-10-02T22:38:21Z
Checks-reserve begins: 2026-10-02T22:33:21Z

ROUTE: actual script S exit0 on absent explicit new paths; substantive XL
irreversible dispatch, privacy boundary and durable schema. Existing owner approval
covers unchanged plan/team/autonomy; no broad toolkit/history survey.
Companion prepare applied; canonical B1–B6, Pseudocode3–7, safety-v1,
SC-US-003-4/5 full10-row examples,005-5/6 and006-5 crossread. Forecast
insufficient_data. Caller-owned manifest/events/launch preserved unstaged.

Implementation: src/dispatch/submission.ts conditional lock-first final commit,
message/adapter modules, additive005 durable sink/token/outcomes, process-only mode,
owner API reads, operator CLI tick, shared complaint effect. Durable F04 interfaces
are described in implementation-b.md; reuse provenance in reuse-b.md.

| AC | Evidence planned | Current result |
|---|---|---|
| B1 | final guard/lease/poll/quota and midnight subtests | PASS; zero calls on blocked transition |
| B2 |20 realPG barrier races using actual10 writers, plus later queued jobs | PASS; before0, after1 and later0 |
| B3 | durable rendered sink/token/refs; second pool persistence, intended peer/foreign private isolation; HTTP401/404/400/403/no tick | PASS |
| B4 | proved5/30s, max3/120s, revoked retry guard; timeout/throw/crash/forged proof/permanent outcomes | PASS; unknown retains quota, no resend |
| B5 | midnight concurrent provider lower,59.999/60/60.001/future/incomplete, exact45s lease and120s deadline; disabled startup mode | PASS |
| B6 | type/lint/build, unit14, fullPG46, restored26, final guard mutant exit1, secret/audit and source/image binding | Author gates PASS; independent review PENDING parent |

Limitations: F04 public unsubscribe/IMAP and F06 UI out of scope; live disabled;
verified_test is only a local fixture, not real provider verification. Whole F03
acceptance requires parent fresh independent B review. No fabricated usage/cost.
Acceptance: pending parent independent B review

## Actual checks and bounded corrections

Early-Implementation-Revision: d2e801f44f0125d21799f1fad2e44fba836dd720.
Initial runner: bash scripts/check-f03b-heavy.sh, exit2 at22:23:30, failed
TypeScript test tuple index (attempt possibly undefined). Heavy acquired22:23:22,
released22:23:30. Fixed the table with readonly tuples; no runtime semantic change.
Evidence: sol-b-heavy.txt.

Corrected runner: same command, exit0, heavy acquired22:23:54,
released22:25:56. Evidence: sol-b-heavy-r1.txt. Commands that completed inside it:

| Exact command (project root) | Exit | Evidence |
|---|---:|---|
| npm run typecheck (CPU2 taskset) |0|heavy-r1 log|
| npm run lint (CPU2 taskset) |0|heavy-r1 log|
| npm run build (CPU2 taskset) |0|heavy-r1 log|
| DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f03b-web . |0|heavy-r1 log|
| docker compose -p n7f03b up -d --no-build --wait |0|heavy-r1 log|
| docker compose -p n7f03b exec -T web npm test |0|14 tests passed|
| docker compose -p n7f03b exec -T web npm run test:integration |0|46 tests passed, realPG16 incl20 B races|
| python3 scripts/check-f03b-mutation.py |0|sol-b-mutation.txt; mutant itself nonzero required|
| docker compose -p n7f03b exec -T web ./node_modules/.bin/tsx --test tests/submission-integration.test.ts |0|26 restored tests passed|
| python3 scripts/check-f03b-secrets.py |0|sol-b-secret-scan.txt|
| npm audit --audit-level=high (CPU2 taskset) |0|0 vulnerabilities|

Image from first corrected build:
sha256:2f83f1bf9bbc4a6aa722f5f00c0fa9f8bad7cf99d81934ffae54b93e0aebca4f.
Node host20 warning is disclosed; actual runtime image Node22.20.0.
Final-only freshness mutation removed the final complete poll predicate while
claim still required freshness. A claimed job with changed stale poll then made
a call, and the exact-boundary assertion failed. Source/container restored in
finally; sol-b-restored-source.txt binds the restored file SHA.

While the first image was checking, author added the necessary explicit sink field
whitelist (no foreign tenant UUIDs in peer messages) and real HTTP auth/tenant/Origin
assertions on the new read routes, including no HTTP tick or user live selector.
These bytes require one affected recheck/build; original green is not asserted as
proof of that delta. Heavy grant was removed by parent after first release;
attempt22:27:02 exit1 stopped at missing grant before any heavy acquisition.
A wrong-cwd preparation edit also failed before writing; no optional120s change
was made. Current intended final delta is ONLY whitelist and API assertions.

## Final changed-byte verification

Final-Implementation-Revision: cb5821f567912bfd2377cd2ec76bac29e1be2f95
Build-Revision: cb5821f567912bfd2377cd2ec76bac29e1be2f95
Build-Image: sha256:e2f5be561b7b86e52897be2758eda38669b96038d180ea955aa5dfa2e69dd1dd
Final source snapshot: sol-b-source-image.json. All46 image build inputs (src/db/tests,
package/lock/TypeScript/eslint) SHA256 equal the restored running container.
Final submitting source SHA256:
0e881f381af7f7abf4d7e61d305a094a7e29677865e60f1fd7f3f888a3f462cc.

bash scripts/check-f03b-final.sh: exit0, heavy acquired22:29:52, released22:31:24.
Evidence: sol-b-final-checks.txt. Final commands/exits:

| Exact command | Exit | Result |
|---|---:|---|
| npm run typecheck (CPU2 taskset) |0|changed source/test types pass|
| npm run lint (CPU2 taskset) |0|changed source/test lint pass|
| DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f03b-web . |0|includes npm run build exit0|
| docker compose -p n7f03b stop web |0|own service only; preserves own DB|
| bash ../../scripts/check-port-conflicts.sh . |0|18704 free after own stop; no DB hostports|
| docker compose -p n7f03b up -d --no-build --wait |0|new own image healthy|
| docker compose -p n7f03b exec -T web npm run test:integration |0|46/46 incl fullF01/F02/F03a/B and HTTP delta|
| python3 scripts/check-f03b-mutation.py |0|mutant exit1, exact60s assertion failed; restored host/container|
| docker compose -p n7f03b exec -T web ./node_modules/.bin/tsx --test tests/submission-integration.test.ts |0|26/26 after restore|
| python3 scripts/check-f03b-secrets.py |0|runtime key/contact/credential canary scan clean|
| docker compose -p n7f03b exec -T web node --version |0|v22.20.0|
| docker image inspect n7f03b-web --format 'IMAGE {{.Id}}' |0|image above|
| bounded Python SHA256 comparison of46 build inputs via own container node fs+crypto |0|all equal; sol-b-source-image.json|

Final binding check took lock22:32:26–22:32:26, exit0; only source/image reads,
no repeated tests. Unit14 and audit0 remain valid with unchanged unit/lock inputs;
final type/lint/fullPG were repeated because concrete related bytes changed.
No fresh external provider verification, reputation or delivery claims were made.
Own runtime /tmp/n7-f03b-runtime; stack/network/volume n7f03b; web127.0.0.1:18704.
Existing n7f01/f02/f03a left intact; no push/deploy/real mail/IMAP/browser/LLM spend.
Companion E2E preflight: not_applicable, no browser/E2E acceptance claimed; these
are isolated realPG/API integration checks. Author handoff is source-bound below.

Durable F04 handoff: Message-ID in send_job/local_test_message; unsubscribe_token
SHA256 random32-byte capability lookup bound to job/tenant/mailbox/enrollment/
recipient digest/30-day expiry; DispatchSeams.recordPoll/stopEnrollment/suppress/
complaint share the SAME eligibilityTransaction and F02 writer boundary. Public
unsubscribe consumers and genuine poll/reply producer belong to F04, never enabled
here. Private campaign reads remain tenant-scoped; only intended pool peer fixture
can read disclosed sender/headers/test body. Recovery SQL unknown maps explicitly
to unknown_delivery; no automatic recovery claim of submitting/unknown.

Independent B review remains parent-owned and required before whole F03 ACCEPT.
This completed author receipt does not assert that independent review happened.
Missing measurements: actual model/effort/fallback metadata, exclusive token usage,
billing cost, exact active-vs-infrastructure wait split (all null pending host).
No model configuration switched; no agents used. Savings not established.

Finished-At: 2026-10-02T22:33:34.976510+00:00
Elapsed-Wall-Ms: 1213791
Active-Wall-Ms: null (complete wait interval accounting unavailable)
Verdict: PASS
Status: completed
