# F10 — durable scheduling algorithms

Baseline2248aa17; prospective contracts. Existing final submission, UID page transaction and physical owner proofs retained.

## Data Structures

RuntimeDue: tenant_id UUID, mailbox_id UUID, kind enum(poll,pool,dispatch), due_at Timestamp (original eligible due), next_check_at Timestamp, last_served_at Timestamp|null, service_seq bigint, state enum(ready,claimed,blocked), owner_id UUID|null, lease_until Timestamp|null, generation bigint, failure_count integer0..5, reason enum(ready,waiting_peer,waiting_budget,waiting_capacity,waiting_pacing,transport_busy,provider_backoff,authority_denied,rescan_incomplete,cleanup_blocked,db_unavailable). Unique(mailbox_id,kind). Claimed quantum lease120s; expires means stale logical claim only, not physical close. Reclaim increments generation; completion CAS compares owner+generation.
RuntimeTenantTurn: tenant_id UUID, kind enum(poll,pool,dispatch,capacity), service_seq bigint; unique(tenant_id,kind). Sequence comes from PG sequence and is persisted on selection, including failed/busy turn.
RuntimeMailbox: tenant_id UUID, mailbox_id UUID; next_smtp_at Timestamp default epoch, pool_peer_after UUID|null, pool_day Date UTC, pool_round_started_at Timestamp|null. Unique(mailbox_id). Scheduling metadata grants no consent/activity.
Existing CapacityLease row presence means previously requested activity; active/waiting_capacity state and expires_at stay canonical120s. Deactivation deletes row and therefore intent. Existing mailbox_poll.poll_owner, ReplyStore Rescan identity/cursor/attempt/pages and TransportSlot remain unchanged. Existing send_job states and pair/parent unique indexes remain unchanged.
Process state enum(starting,running,draining,stopped,cleanup_blocked); one AbortController,≤4 poll tasks and≤2 send tasks, one finite maintenance task, one cancellable wake timer. Local worker clock uses monotonic durations; eligibility/deadlines and UTC day use post-lock PG clock. No new AI kind active in F10.

## Core Algorithms

### Algorithm: Start drain and recover
REQUIREMENT: `FR-f10-durable-runtime-001`
REQUIREMENT: `AC-f10-durable-runtime-001`
REALISES: SC-F10-001
INPUT: validated process modes, DB, signal; OUTPUT: durable progress or typed cleanup_blocked.
STEPS:
1. Check ready/schema, construct actual native adapters or explicit local_test sink; register signal before launching tasks. Load due rows keyset-bounded, run SubmissionStore.recoverAbandoned and retryClosedSlots. Never reconstruct close proof from expires_at/PID/process age.
2. Under eligibilityTransaction FIRST lock reclaim expired logical claimed rows by owner/generation CAS; preserve reply cursor and existing dispatch claim rules. Old completion cannot publish after generation change. Reclaim does not free TransportSlot or authorize new IO in occupied mailbox.
3. Start finite lanes. Each claims only when its prior promise and cleanup have settled. A running lane calls scheduling algorithm and awaits its operation; scheduler never Promise.all(mailboxes). Idle waits one abortable timer, wakes on signal/nearest due≤1s.
4. SIGTERM/SIGINT sets draining before awaiting anything; cancel wake timer and all operations. Poll passes signal through ReplyAdapter to runTransportChild; submission uses existing signal. Join tracked promises, retry exact closed proofs, close PG pool only after callbacks settle. DB operations get bounded query/connection timeout, no hanging pool.end fallback silently abandons active handlers.
5. Abort applies both to timeout loser and underlying work: Promise.race alone is insufficient. Use one shared cancellation scope, await exact child exit or persist cleanup_blocked;15s drain budget as spec. Force-stop container only via existing operator deployment lifecycle, never arbitrary PID from a DB row. RETURN state/counts.
COMPLEXITY: bounded≤6 IO tasks plus one maintenance task per process; physical global slots bound fleet.

### Algorithm: Fair polling and capacity maintenance
REQUIREMENT: `FR-f10-durable-runtime-002`
REQUIREMENT: `AC-f10-durable-runtime-002`
REALISES: SC-F10-002
INPUT: due rows and requested capacity rows; OUTPUT: fenced poll quantum or wait.
STEPS:
1. Maintenance every≤30s visits existing requested capacity rows, under FIRST lock rechecks mailbox/config/current intent. Renew still-active eligible rows to now+120s with existing CapacityStore semantics. Expired rows become waiting; admit waiting oldest tenant turn then mailbox when global count<30. Never INSERT intent for a connected-only/deactivated mailbox; actor revoke/deactivate wins lock ordering.
2. Reconcile at most100 mailbox records per keyset page into unique RuntimeDue rows only if intent exists; UPSERT must not reset oldest due or failure state on every sweep. Mark ineligible rows blocked with typed reason, preserving oldest due observation.
3. FIRST lock; select eligible tenant with minimum service_seq, then its earliest due/next_check<=now mailbox using FOR UPDATE SKIP LOCKED LIMIT1. Advance tenant turn immediately, claim owner/generation120s and claimPoll owner. Cross-check capacity and transport authority before leaving TX.
4. Execute one protocol snapshot or one read/page outside TX. Preserve ReplyStore.capture/page/failTail semantics; persist page/stop/cursor atomically with combined due owner, poll owner and grant fence. A tail snapshot requires fixed horizon; checkpoint between operations by existing Rescan fields, not process-local horizon. Successful page quantum requeues continuation so other tenants may run.
5. Complete proof sets next poll due anchored to poll round start+30s (never completion+30s); if overdue, retain overdue evidence, do not overlap same mailbox. Normal health measurement uses completed_at gaps. Reset/incomplete enters explicit retry path with current run identity: ReplyStore.retry resets only attempt/page budget, not cursor or scan_complete. Each attempt≤20pages/120s; backoff between failed attempts. A restart of scanning resumes persisted cursor within original attempt budget or marks incomplete before retry.
COMPLEXITY: indexed due claims,≤100 records/page;≤1 adapter operation per scheduling quantum.

### Algorithm: Preserve finite physical ownership
REQUIREMENT: `FR-f10-durable-runtime-003`
REQUIREMENT: `AC-f10-durable-runtime-003`
REALISES: SC-F10-003
INPUT: selected mailbox and protocol; OUTPUT: exact operation result/cleanup proof or busy.
STEPS:
1. Reuse acquireTransportSlot: slot operation IS NULL and no occupied same protocol/mailbox. Expired non-null rows remain occupied. Local_test lanes honor same configured concurrency; real socket proof uses production child path.
2. Bind exact child before sending request; propagate AbortSignal through LiveReplyAdapter.snapshot/read to runTransportChild. Do not permit fixture CA/resolver/ports in runtime config. SMTP≤95s parent lifetime, IMAP≤35s parent lifetime plus existing5+5s confirmed-exit cleanup; protocol budgets remain90/30s.
3. On timeout or drain seal against new IO and await existing exact child exit. closedOwnerProof and releaseTransportSlot CAS own operation/owner/host only. retryClosedSlots retries preserved in-process proof after DB returns; never collect unbounded promises while release fails.
4. Parent crash loses in-process proof: surviving/orphan slot stays cleanup_blocked, even after restart120s. Safe independent free slots and non-IO recovery continue. All-slots-orphaned is an explicit availability blocker, never healthy restart PASS. Operator recovery must confirm termination of the exact previous isolated worker container including its children before a narrow privileged reconciliation of its occupied operation IDs; no flag that merely asserts age/death and no raw PID kill. Until an independently tested attestation path exists, operator keeps affected slots blocked. Graceful restart normally drains and requires no orphan attestation.
COMPLEXITY:≤6 occupied rows; O(1) slot operation, finite exact cleanup proofs.

### Algorithm: Claim paced dispatch and recheck final fence
REQUIREMENT: `FR-f10-durable-runtime-004`
REQUIREMENT: `AC-f10-durable-runtime-004`
REALISES: SC-F10-004
INPUT: due queued jobs, mailbox pacing; OUTPUT: submitted/unknown/blocked/retry.
STEPS:
1. Extend DispatchStore.claim with tenant rotation and optional selected-mailbox predicate in same FIRST-lock transaction, preserving every existing predicate/claim45s/current-day reservation. Choose oldest due job across scopes; exclude mailbox if now<next_smtp_at or provider cooldown. Claim only when send lane available; do not prefetch45s claims into queue.
2. SubmissionStore final transaction re-evaluates complete canonical eligibility, current grant/revisions, both pool participants and DB UTC day after lock wait. Lock RuntimeMailbox and require next_smtp_at<=now. Atomically set next_smtp_at=now+60s together with submitting; provider later cooldown overrides. Pacing survives crash/restart, local_test and protocol_fixture use same fence. Failure before final commit does not spend pacing; after commit it stays conservative.
3. Commit then perform exactly one adapter call. Existing result classifier alone controls reservation/retry; max(original due delay, pacing, provider cooldown) becomes retry due. Cancel retry if next due>=first_attempt+120s or attempts exhausted. No time-based release of submitting/unknown quota, no alternative dispatch path.
4. Outcome/claim release CAS updates RuntimeDue; failed/busy sender yields turn. Stop/grant/capacity writers continue FIRST global lock; no async network inside transaction. Preserve stable message identity and existing unsubscribe/thread metadata.
COMPLEXITY: indexed job claim and O(1) pacing lock; bounded IO external to TX.

### Algorithm: Allocate pool automatically without duplicate backlog
REQUIREMENT: `FR-f10-durable-runtime-005`
REQUIREMENT: `AC-f10-durable-runtime-005`
REALISES: SC-F10-005
INPUT: current pool_member+consent, due sender and UTC day; OUTPUT: one job or durable waiting.
STEPS:
1. Reconciliation derives pool RuntimeDue from existing affirmative pool_member, unique(mailbox,kind); never manufacture consent or recreate removed membership. Within FIRST-lock transaction reload sender and peer eligibility using canonical poolEligible and shared current UTC quota. Allocation due repeats≤300s; ineligibility does not send.
2. Select sender by tenant turn/oldest due; require no existing queued/claimed pool outbound job. Compare eligible submitted-parent replies and initial allocation due by oldest timestamp, UUID tie; reply only opposite participant, unique(parent_id), never reply to reply/unknown parent.
3. For initial candidate, scan active peer IDs after pool_peer_after with one wrap, at most30 candidates per sender quantum. Check distinct tenant, active current120s lease, fresh completed poll<60s, consent/current grant if live and both budgets. Pair key=sorted mailbox IDs plus DB UTC day. INSERT ON CONFLICT DO NOTHING; on conflict advance cursor and continue, never return merely because first pair conflicts.
4. Persist cursor and new job atomically with owner/generation CAS; creation success rechecks backlog in same transaction. At most1 new pool outbound/sender per quantum. Replayed crash after commit hits unique keys. After exhaustion record waiting_peer/budget as applicable, next_check bounded; retain round_started and unserved age. Fair sender rotation visits all≤30 active participants within5min healthy target.
5. Midnight rebuilds pair key/day and resets peer cursor only after current DB day differs; queued old-day initial is revalidated before claim/final: if its pair-day is stale, cancel movable old job and allocate a unique current-day pair rather than submit an old key into new day. Existing submitted/unknown history and thread reply uniqueness remain; replies retain parent identity and cannot create another initial for same current pair/day conflict. No deletion of historical outcomes.
COMPLEXITY:≤30 peer candidates per quantum,≤30 active senders/round; finite metadata per mailbox.

### Algorithm: Persist overload and backoff
REQUIREMENT: `FR-f10-durable-runtime-006`
REQUIREMENT: `AC-f10-durable-runtime-006`
REALISES: SC-F10-006
INPUT: typed outcome and due owner/generation; OUTPUT: bounded next_check plus visible original age.
STEPS:
1. CAS completion under FIRST lock; preserve due_at while work remains unsatisfied, store reason/last_served and advance fair turn. Separate due_at from next_check avoids making outage disappear from age.
2. Provider/transient poll failure uses30/60/120/300s capped backoff and failure_count≤5; success resets. No peer uses next pool round≤300s; quota exhausted defers UTC midnight but stopped/current state rechecked by maintenance; pacing uses exact next_smtp_at; busy slot rechecks≤1s without holding a claim/promise queue.
3. DB failure: cancel admission, let bounded in-flight cleanup run, preserve occupied slots on failed release; reconnect uses capped backoff. Per-provider failure does not occupy all maintenance/send lanes. Surface per-mailbox due/overdue/blocked plus sampled operation/queue ages with opaque IDs only.
4. Bounded keyset reconciliation continues from cursor, never restarts at first100 indefinitely. Shutdown cancels wakeup. All metrics include failed/blocked participants; no healthy cadence claim from averages/completed-only data.
COMPLEXITY: O(1) per outcome, paginated finite scan.

### Algorithm: Wire and verify local runtime
REQUIREMENT: `NFR-f10-durable-runtime-001`
REQUIREMENT: `AC-f10-durable-runtime-007`
REALISES: SC-F10-007
INPUT: candidate/spec SHA, modes and acceptance harness; OUTPUT: source-bound gates and independent verdict later.
STEPS:
1. Export side-effect-free runtime constructor; CLI explicit tick/loop owns signal handlers and pool lifecycle. Keep existing tick commands compatible through wrapper; a single persistent worker includes independently bounded poll/send/maintenance lanes. Compose profile starts loop with ports:[], disabled defaults, scoped secrets and no engine socket. No fixture selector from env/HTTP.
2. Test real PG and native local TLS against frozen30-active/100-connected fixtures, restart, busy/no-peer and pair conflict. Record exact parent test and per-criterion witnesses, canaries and fail-capable mutations. Billing TEST unchanged; UI untouched.
3. Run required full gates and independent review with actual source hashes; keep F06 gaps and external F15 blockers distinct. PLAN only runs traceability; do not create a fake validation/review or runtime receipt.
COMPLEXITY: existing local harness, no new platform/install.

## API Contracts
No new HTTP public route. Internal constructor takes Config, Pool, trusted optional fixture adapter and AbortSignal; CLI prints typed readiness/progress, never credentials/provider lines. Runtime source/cancellation arguments are internal, not request-selected. Durable owner/generation fences compose with existing ReplyStore.TransactionGuard and SubmissionFixtures.signal.

## State Transitions
RuntimeDue ready→claimed→ready/blocked; blocked→ready only after current eligibility recheck; expired claimed→ready with generation increment. Send states remain queued→claimed→submitting→submitted/unknown/cancelled or proven-pre-DATA queued. Physical occupied→free requires exact closure proof independently of RuntimeDue.

## Scenario Coverage
Scenarios in01:7; claimed by algorithms:7. Unclaimed: none. Extra claims: none.
