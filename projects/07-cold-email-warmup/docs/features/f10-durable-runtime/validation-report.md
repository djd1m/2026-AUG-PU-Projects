# F10 — независимая проверка требований
Spec revision: sha256:410d329fcc9d433f51e554310318457096a8dfdd82aad9754e47d7122744eeb8

Verdict: READY
Source revision: 952e356dea272af16d8cc19807ea0408c34e1b9b
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT_ID: f10-validate-r2
Profile: compact-quality-first-v2; requested gpt-6-astra/high; actual model/effort/usage/cost: null (host_not_exposed).
Actual r2 tool ACK: 2026-10-06T15:04:12.804453174Z, exec date -u in the isolated worktree; narrow escalation reused because default bwrap cannot start.

## Scope and source inventory

Fresh requirements-validator r2 checks all required current inputs and the complete four-role diff f0c580b6..952e356d. The earlier substantive independent five-role/runtime reads are retained as source analysis; unchanged runtime and F09 contracts were verified by the source diff, not rerun as runtime tests. All five role files and their current hashes were checked afresh. Only this report changes. OWN-N7-005 covers scope; substantive XL and full /feature gates remain. Companion E2E preflight: not_applicable, documentary validation only. Coordinator owns telemetry and subsequent implementation routing.

| Role | SHA-256 |
|---|---|
| 01_specification.md | 410d329fcc9d433f51e554310318457096a8dfdd82aad9754e47d7122744eeb8 |
| 02_pseudocode.md | fab8c4f63782f59e07fb19b073bed73fe41e0d5822da1c4cd39887591c6902ae |
| 03_architecture.md | c76c1fc569c4116ce7e70eafb624b83dd5de3a7288ac937fc03ece15ef43064b |
| 04_refinement.md | 34f8cc017558c31cd92fc022fe32f4ef084c6c632dcf57f251ba4f876d95ce4c |
| 05_completion.md | 913b45a0e49dbfc95e98d33db485c382d1e935f77f3559c2fd1e4835e2278b27 |

All five current roles are available and substantive. The r2 full-project original Phase I/II command and actual exit are stored in /tmp/n7-f10-validate-r2/phase12.txt and phase12.exit. Historical planner A1/A2 failures, validation a1 timing failure, and corrective planner r3 freeze failure remain failed; their receipts are not aggregated as accepted. The original a1 report is preserved by commit f0c580b6 and coordinator evidence/f10-validate-a1 with SHA184d5a231ab1c74fa0705c4cba160a989d441fb0c06be050bc6983e21b2e9e1b. This fresh verdict binds the present source independently.

## F10-V1 closure

**F10-V1 — formerly High, resolved in source952e356d.** Current01 AC002/003 and Eligibility explicitly separate service order from original due age. Current02:36 orders each tenant's eligible unclaimed mailbox by RuntimeDue.service_seq first, with due_at/UUID only as ties. In the same FIRST-lock claim transaction both tenant and mailbox receive fresh PG sequence values before I/O; rollback starts no operation. Every committed selected quantum consumes its turn, including later busy/failure. Current02:37 retains this order on page yield, and:84 forbids reset or double advancement on completion/reconciliation/restart. New rows initialize0 only on INSERT; original due_at remains the overdue observation.

Architecture03:45 maps the service ordering index and separate wakeup index without changing authority or physical ownership. Refinement04 SC002/003 now specifies four older long rescans A–D plus later-due healthy E: after first quanta E precedes any A–D continuation, restart preserves ordering and original age, and actual per-mailbox selection/completion gaps are measured. The mutation replacing service order with oldest due or resetting it must fail this witness. The original counterexample is therefore excluded by the corrected design; no new engine or control plane is required. No unresolved High/Medium requirement findings remain. Seven AC identities and exact future test bindings remain intact. Timing targets,20pages/120s, no automatic incomplete-rescan retry and exact physical close/exit proofs are preserved. Runtime implementation and measurements remain future obligations.

## Resolved source questions and implementation boundaries

- **Retry authority:** 02:38 is read together with03:49 and parent expanded-mvp/01_specification.md:104. An ordinary tick cannot clear rescan_incomplete. Actual src/replies/operator.ts:7–18 supplies an explicit process/file-authorized local_test retry; src/replies/store.ts:58 checks current run identity and resets only attempt/pages/time. src/replies/worker.ts:26 returns on incomplete. Thus backoff/timers/restart are not permission to call retry. A scanning continuation retains its original attempt; exhausted live work remains paused unless an already authorized explicit path exists. F10 must not silently extend the local_test operator to live_provider. With this source-bound interpretation the documents are consistent; no automatic retry finding is asserted.
- **Horizon and atomic stops:** ReplyStore.capture/page/failTail retain UID generation, cursor CAS,20pages/120s and atomic effects. Architecture49 explicitly introduces only a guarded fixed-tail checkpoint between snapshot and fetch; continuation bookkeeping cannot manufacture completed_at. Accepted F09 AC005/006 and capability-contracts remain immutable.
- **Logical versus physical ownership:** runtime generation/poll/source guards fence writes; they never prove socket death. transport-slots.ts admits only operation IS NULL, rejects occupied mailbox slots regardless of expiry and accepts identity-bound closedOwnerProof. Exact child exit or sealed close remains mandatory. Restart with lost proof blocks affected slots; all-slot orphaning is an explicit availability limitation, not successful healthy recovery. No new attestation mechanism is assumed.
- **Activity:** capacity.ts has global30,120s lease, renewal of active rows and deletion on deactivation. Planned maintenance rechecks existing intent under FIRST lock and must use client-level helpers, avoiding nested independently connected transactions. It cannot INSERT activity for connected-only or deleted intent. Waiting admission remains bounded and tenant-fair.
- **Submission and limits:** eligibilityTransaction actually locks(7,1) first after BEGIN; SubmissionStore samples DB time after locking and rechecks both peers, current grant/config, poll freshness and current UTC shared quota. Default10/max30/lower provider cap and unknown quota retention remain. Proposed pacing commits atomically at final submission; pre-DATA retries obey both spacing60s and original max3/120s, without expanding the horizon. All adapter network operations remain outside the transaction.
- **Pool:** existing PoolStore picks the first pair; planned bounded cursor/ON CONFLICT continuation repairs that gap. Consent-derived membership, distinct tenants, one movable outbound job, unique unordered pair/day and submitted-parent-only single reply give a bounded plan. Old-day initial cancellation/reallocation before claim/final preserves current UTC uniqueness; historical submitted/unknown and reply parent identity are retained. No second consent flow or consent manufacture is introduced.
- **Lifecycle and concurrency:** current dispatch CLI is one-shot; live PollWorker selects LIMIT1. Planned explicit loop, finite4/2 lanes, owner CAS and20-worker PG witness address actual gaps. Child cancellation is propagated and joined; DB connection/query cleanup must fit conditional15s, with cleanup_blocked instead of forced release when proof/DB is unavailable. These are implementable bounded changes, not current runtime passes.

## INVEST and SMART scoring

One composite F10 story has seven AC. The rubric is applied to the frozen artifact, not to hypothetical code. INVEST: Independent8/8 (accepted F09 dependency is already available); Negotiable8/8 (native safety contracts fixed, internal implementation open); Valuable10/10 (automatic consented operation and visible waits); Estimable8/8 (concrete decomposition and resolved scheduling correction); Small4/8 (cross-store work requires bounded slices); Testable8/8 (quoted AC below and named scenarios). INVEST46/50.

SMART: Specific6/6 (literal states, authorities and thresholds); Measurable8/8 (per-mailbox gaps, counts, faults); Achievable6/6 (F10-V1 ordering is corrected; conditional timings still require real runtime evidence); Relevant5/5 (all seven support the story); Time-bound5/5 (15/30/60/120/300s and UTC boundaries). SMART30/30. Quality: Traceability10/10 via this report's Criterion scenarios table; Completeness10/10 via quoted AC and happy/error/edge/security scenarios below. Base96/100. Security bonus+5 (tenant, grants, stop/quota/freshness/socket proofs specified). Growth bonus+5: existing discovery seeds FR-GROWTH-001..004 survive explicitly in canonical Specification.md; F10 adds no acquisition obligation. Bonuses are recorded separately from the bounded96/100 base and are not used to inflate the base above100. No blocking requirement findings remain; READY authorizes the next implementation stage, not runtime acceptance.

Blocking floors are all nonzero on actual artifacts: Testable8, Completeness10 and Traceability10. No unnamed or uncovered AC. All runtime results remain unexecuted.

| Criterion | Quoted AC text from01, corresponding AC heading | SMART assessment |
|---|---|---|
| AC-f10-durable-runtime-001 | “новые claims после начала drain отсутствуют”; “Graceful drain≤15s” | Specific shutdown/recovery states, conditional measurable bound; feasible with retained blocked outcome |
| AC-f10-durable-runtime-002 | “healthy complete poll cadence≤30s, fair due-work round≤60s” | Specific and measured per mailbox; F10-V1 closed by durable per-mailbox order |
| AC-f10-durable-runtime-003 | “peer-observed sockets≤2 SMTP/4 IMAP/1 per protocol mailbox”; “20pages/120s attempt” | Physical and attempt limits measurable; within-tenant page fairness now explicit |
| AC-f10-durable-runtime-004 | “current-day shared default10/ceiling30/provider lower cap preserved”; “sender starts≥60s apart” | Literal quota/pacing/UTC and before-after stop outcomes; feasible existing final fence |
| AC-f10-durable-runtime-005 | “unordered pair/day≤1 и thread≤2 total”; “рассматривается≤5min” | Bounded peer cursor, duplicate/error cases and observable deadline |
| AC-f10-durable-runtime-006 | “due age не обнуляется”; “backoff30/60/120/300s capped300s” | Failure outcomes and time/cap bounds explicit, independent progress includes the specified V1 adversarial witness |
| AC-f10-durable-runtime-007 | “loop переживает больше одного round”; “disabled default даёт0 external calls” | Reproducible candidate/build/config and named full gates, no future test counted as execution |

## Criterion scenarios

| Criterion | Scenario |
|-----------|----------|
| AC-f10-durable-runtime-001 | SC-F10-001 — Durable drain and uncertain recovery |
| AC-f10-durable-runtime-002 | SC-F10-002 — Every requested active mailbox receives a fair turn |
| AC-f10-durable-runtime-003 | SC-F10-003 — Suspended physical owners retain slots |
| AC-f10-durable-runtime-004 | SC-F10-004 — Current quota pacing and stop fence |
| AC-f10-durable-runtime-005 | SC-F10-005 — Pair conflicts advance automatic allocation |
| AC-f10-durable-runtime-006 | SC-F10-006 — Overload retains age and independent progress |
| AC-f10-durable-runtime-007 | SC-F10-007 — Reproducible persistent runtime witness |

## Named BDD scenarios

### SC-F10-001 — Durable drain and uncertain recovery
Given queued, claimed, submitting, unknown and scanning work, When SIGTERM drains or crash/restart occurs, Then admission stops immediately, expired logical owners are fenced, safe work resumes and cursor/pause survive; submitting becomes unknown after120s and is never resent. Given missing exact exit proof or DB cleanup failure, When the conditional15s budget ends, Then cleanup_blocked retains occupation and unknown quota. Given complete exact exit and available DB, Then drain finishes within15s.

### SC-F10-002 — Every requested active mailbox receives a fair turn
Given100 connected/30 explicitly active across≥3 tenants, When healthy rounds and restart execute, Then each active mailbox completes within30s gaps, due selection within60s, leases renew before120s and global admission never exceeds30. Given deletion/revoke racing upkeep, Then deleted intent is not recreated and waiting admission fairly uses released capacity. Given four older long rescans and a later-due healthy same-tenant peer, When page quanta repeatedly yield, Then the peer must receive its bounded turn without resetting original due age; the corrected algorithm must select E before any A–D second quantum. Restart after claims/yields preserves service_seq and original due_at; busy/failure consumes the already committed turn. Record E completion≤30s and selection≤60s in the declared healthy fixture window.

### SC-F10-003 — Suspended physical owners retain slots
Given competing workers and an actual child SIGSTOP longer than120s, When leases expire or another process restarts, Then observed physical sockets stay≤2SMTP/4IMAP/1protocol-mailbox and no orphan slot is reclaimed. When the exact child exits, Then only its identity-fenced slot releases; DB failure defers release and stale proof cannot clear a new owner. Given yielded or exhausted scan, Then no false freshness appears and20pages/120s remains enforced.

### SC-F10-004 — Current quota pacing and stop fence
Given mixed pool/campaign work,20 workers, provider cap3 and a lock wait across UTC midnight, When final submission races each consent/suppression/quarantine/grant/config/capacity stop, Then current-day shared quota wins, start spacing≥60s and no I/O is in the transaction. Given stop-before, Then zero adapter calls; stop-after permits only committed in-flight work. Given proven pre-DATA failure, Then retry also fits120s and pacing; unknown produces zero resubmissions.

### SC-F10-005 — Pair conflicts advance automatic allocation
Given distinct opted-in tenants and the first pair already used today, When concurrent pool rounds/restart run, Then another legal peer is visited, every eligible sender is considered within300s, pair/day≤1, thread≤2 and movable backlog≤1 per mailbox. Given no consent/peer, same tenant, stale peer, exhausted budget or unknown parent, Then zero matching new sends and a typed wait. Given midnight, Then stale movable initial is cancelled/reallocated with current key while reply parent uniqueness and uncertain history survive.

### SC-F10-006 — Overload retains age and independent progress
Given a noisy tenant, failed provider, busy slots and exhausted quota, When scheduling proceeds then DB briefly fails, Then independent eligible participants progress, bounded backoff is30/60/120/300s, busy retry≤1s and idle wait is cancellable≤1s. Then original due age and all overdue/blocked outcomes survive restart; DB outage stops new admission and is never counted as a healthy pass. Keyset scans stay≤100 and peers≤30 per quantum.

### SC-F10-007 — Reproducible persistent runtime witness
Given frozen source/spec/build and disposable PG/local TLS fixtures, When the built CLI loop performs multiple rounds, restart and fault phases, Then the literal parent witness and all supporting tests execute with per-mailbox timings and resource evidence. Tick exits, import starts no worker, disabled configuration makes zero external calls and fixture authority is unavailable through env/HTTP. Missing gates or grants fail acceptance; F06 deficits remain visible.

### Security scenarios inherited and exercised by F10
Auth bypass: Given an unauthenticated or revoked-session request for consent/activity, When it reaches existing API while runtime is active, Then authorization fails and no runtime intent/send is created. Input injection: Given malformed UUID or SQL/header control text, When existing input boundaries and parameterized worker paths process it, Then input is rejected and neither SQL scope nor mail headers change. Cross-tenant: Given a tenant-supplied foreign mailbox/job ID, When claim/retry/page mutation is attempted, Then tenant predicates deny mutation; only separately consented pool matching may cross tenants. No new auth endpoint is added; rate-limit/brute-force behavior remains existing auth regression scope, not a new F10 endpoint.

## Exact future test bindings

These names are assignments from05_completion.md, not claims that files exist or ran.

| Criterion | Future test file | Exact future test title |
|---|---|---|
| AC-f10-durable-runtime-001 | tests/f10-runtime-integration.test.ts | durable runtime drains and recovers without replaying uncertain sends |
| AC-f10-durable-runtime-002 | tests/f10-runtime-integration.test.ts | fair polling serves thirty active mailboxes and preserves activity intent |
| AC-f10-durable-runtime-003 | tests/f10-runtime-protocol.test.ts | suspended transport owners retain physical slots across runtime restart |
| AC-f10-durable-runtime-004 | tests/f10-runtime-integration.test.ts | paced dispatch preserves current day quota and every stop fence |
| AC-f10-durable-runtime-005 | tests/f10-runtime-integration.test.ts | automatic pool allocation skips pair conflicts and remains idempotent |
| AC-f10-durable-runtime-006 | tests/f10-runtime-integration.test.ts | overload backoff preserves due age and independent tenant progress |
| AC-f10-durable-runtime-007 | tests/expanded-mvp-04.test.ts | persistent fair workers serve every eligible mailbox |

After correction, implementation must execute real PG20-worker concurrency, native local TLS suspension/cleanup/faults, restart/UTC/stop races, secret canaries and fail-capable mutations, plus typecheck/lint/build/full required suites and affected F09/F07 regressions. No Phase III completion gate or runtime/build/browser test is run in this validation. F06 AC011 stays UNVERIFIABLE and AC012 delivery unmet; F11–F15 and external pilot remain pending.

## Handoff and gate evidence

Final verdict is READY for requirements at source952e356dea272af16d8cc19807ea0408c34e1b9b and the exact spec digest above. F10-V1 is closed by the independently inspected correction; all seven AC remain source-bound and scenario-covered. Next responsible actor is the N7 coordinator, who may assign bounded implementation and its mandatory runtime/review gates within existing authority. The original full-project Phase I/II command and exit are recorded in /tmp/n7-f10-validate-r2/phase12.txt and phase12.exit. Terminal receipt /tmp/n7-f10-validate-r2-receipt.md binds commit, actual timings and launch SHA. No Phase III/runtime success is claimed. Coordinator telemetry remains docs/telemetry/p-replicator/20261006T090602Z-n7-expanded-mvp-a1/; model/usage/cost remain null (host_not_exposed). Historical failed receipts remain failed, and inherited F06/F11–F15 gaps remain as stated above.
