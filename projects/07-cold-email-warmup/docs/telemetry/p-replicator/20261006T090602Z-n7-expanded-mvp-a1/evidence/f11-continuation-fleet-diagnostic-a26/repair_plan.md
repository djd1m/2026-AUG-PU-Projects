# A26 source-bound continuation candidate

Status: READY for one bounded MEDIUM implementation attempt of the scoped candidate. This is a completed HIGH operational diagnostic/cause plan, not a product review or proven fleet repair. F11 acceptance/provider enablement/deployment remain closed. MAIN alone owns source integration and project ledger.

Frozen source b6b82cb83cdf7cb1d646784ad169af826e6c6852; production 5c707737fdcb2be4c579eac4cbd71a9a026b8820/build76 unchanged. Input manifest SHA20c27e2d8c05515aee66e6a7adee071475f48cddcd4fb088ab2b368c586dc256, all259 hashes verified.

## Established seam

One directed unchanged fault workload began04:01:32.268, ended04:05:32.842 (240574ms), native launcher wait exit1 joined04:05:36.370273. ALL30/240s gate RED16/30; full300s not reached. Three worker joins code0/signalnull/drainedtrue/empty stderr, own occupation0. This is different measurement from A23 RED18/30 and is not acceptance.

2570 actual continuation SELECTs bind source replies/context-store.ts:76, querySHA4d889c59ce224a825a468f43b9cc548a57bc841e7567f69266ae62c43f83c544 and ASTSHAd21eb101642b3585b6edc07bce86ff9e18b2650aa4bd5e672ab7b5078768902e:2495 zero,74 selected text,1 metadata.96 actual zeros link to same-client FIRST-held entry snapshots with pending text, actual urgent READY headers and free nonreserved BODY slots; all17 visible candidate SQL fences pass.56 of these already have the single reserved slot occupied by a known HEADER operation. Each of6 expired captures has20–28 matching urgency/free-BODY witnesses. Metadata→text claims wait5.690–8.297s and leave2657/1674/1719/2167/731/333ms for an actual2800ms phase. The global NOT EXISTS urgency clause at context-store.ts:84 is a concrete snapshot exclusion despite concurrent available BODY capacity. It is not a unique total-delay decomposition: READ COMMITTED snapshot is separate from SELECT, row-lock SKIP LOCKED timing and nonSQL sender/deadline results are not observed.

Example entry2349/query2350 at04:02:32.306: pending text has5616/5720/6348ms remaining, reserved HEADER operation occupied, nonreserved BODY free; original SELECT returns0. Exact owners/generations/current native run/UID/provenance/window_completed_at/local future due and slots are retained in continuation-visible-predicate-facts.json and active-reserved-header-continuation-zero-facts.json.

## Exact implementation scope and executor

Fresh MEDIUM author, no subagents, one20-minute attempt with stop at concrete artifact/check result; coordinator must actually launch and own continuation. Only these3 source/test files in the selected isolated source checkout:
- src/replies/context-store.ts: continuation urgency predicate only.
- tests/f11-context-integration.test.ts: additive source-level current-owner/slot/urgency counterproofs using existing owned fixtures.
- tests/f10-runtime-protocol.test.ts: additive short native concurrent-header/continuation witness. Existing healthy/fault/active-SIGTERM calls and assertions stay byte-exact.

No schema/config/grant/loop/shutdown/transport-lifetime/fixture changes. If those become necessary, report the exact missing requirement instead of widening this candidate silently.

Replace unconditional global suppression with a fail-closed concurrent-service condition, under the SAME FIRST transaction:
1. With no actually urgent READY header, retain existing continuation selection.
2. With urgent READY headers, permit an already-admitted continuation only while exactly1 reserved IMAP slot has a nonnull exact operation, nonnull owner_process/owner_host, known operation_purpose=header, and a matching tenant/mailbox current runtime_due poll claim with owner_id nonnull and lease_until>post-lock DB now; blocked/cleanup/incomplete/stale claim cannot qualify. A free nonreserved BODY slot must exist and the unchanged BODY acquire must actually succeed. Do not treat expires_at or reservation alone as a live operation/cleanup proof, do not TTL reclaim, and do not synthesize physical ownership. The positive native witness must establish actual concurrent HEADER protocol progress, not just a DB label.
3. If the reservation is free, UNKNOWN, BODY, stale/nonclaimed/cleanup-blocked, missing or duplicated, or BODY capacity unavailable, urgency still wins and existing poll claim path gets the turn. Never simply delete the urgency clause. The live claimed header already runs while continuation uses distinct BODY capacity; all4 slots remain usable by normal headers.
4. Keep every existing SAME-mailbox due/claimed/incomplete header denial, complete-window proof, latest genuinely authenticated native run/attempt/UID/provenance, authority/recipient/root/config/phase revision, expiry/suppression and owner/generation CAS. Retain ORDER BY window_end,capture_service_seq,id and SKIP LOCKED. Preserve first-window FIFO/admission and no-body dueNOW; no budget pretense, renewal or held retry.

This durable current-claim check is conservative scheduling evidence, not proof an OS process is alive. Unconfirmed physical closure remains occupied regardless. If the exact current owner association cannot be established using existing fields, fail closed and hand that precise limitation back; no new heartbeat/registry/schema may be invented in this attempt.

## Literal compatibility obligations

F10 02_pseudocode:38 /03_architecture:69: successful no-body header finish immediately dueNOW with fair advanced order; cadence is actual completed_at gap30s. v2 02:124 /03:101: four existing IMAP jobs, two SMTP, at most3 windows/BODY, one excluded HEADER slot, authentic same-FIRST initial capture only, single fixed12s. v2 02:126 /03:103: urgent actual header deadlines retain priority; separate5s phase budgets, continuation order, SAME-mailbox due/claimed/incomplete denial, original-end commits, current fences, native abort and unknown closure retained. 02:131 /03:108: original450s queue anchor, ALL30 ready<=240 and full300. The candidate preserves HEADER service while allowing distinct BODY progress; it does not establish the30s/60s/240s bounds without the mandatory native gates.

No restart amendment is proposed by A26. At the gate BEFORE cleanup:16ready,6held/window_expired,6pending (5 without window,1 pending text),2claimed text. The two A26 cancelled captures were terminalized only by final240s failure cleanup; they were not cancelled at150s restart. A23 original active150s cancellation of574b/493b remains a separate valid counterexample with immutable raw origins and source-bound exact owner cancellation. If it survives an otherwise accepted scheduling repair, any change to process cancellation/retry requires a separate HIGH normative decision citing original03:57 and v2 02:126/03:103; no implicit non-aborting restart or held retry.

## Required counterproofs and gates

Baseline old urgency clause must produce RED short native pending text under actual unrelated urgent HEADER occupying the reserved slot while BODY capacity is free; candidate must produce actual text phase/commit GREEN inside SAME original12s with two real2800ms phases and ongoing native HEADER completion. Bind current physical operation owner and claim; labels alone cannot pass.

Material mutants: restore old unconditional urgency (positive short fails); unconditional removal (reservedfree/UNKNOWN/nonheader/staleclaim/no-BODY negative fails); drop SAME-mailbox due/claimed/incomplete fence (negative fails); remove current physical/header-owner binding (stale/unknown negative fails); renew original window/450 anchor or retry held (negative fails). Reuse existing negative authorization/current source/UID/root/decrypted recipient/grant/config/generation/AEAD/expiry/stop tests, one-use proof and exact close CAS. Do not fake native revalidation or clocks.

After actual changed-source build and required all existing unit/integration/PG safety suites/focused mutations, require BOTH unchanged ALL30 healthy and finite-fault native workloads, fixed150s restart, real2.8+2.8, original30 denominator/12s/5s/240positive/300full/30header/60selection, exact known-close recovery and drain. Preserve active-SIGTERM short. Disk/resource gates are re-evaluated before any later heavy launch. NEW fresh HIGH product reviewer only after actual mandatory gates. Header max38.933s in A26 (27 participants violate) is independently RED and its unique cause remains UNKNOWN; this candidate does not promise to repair it.

## Evidence limits and terminal facts

49 native BODY/fault phases bind exact physical acquire→same-connection close→exact owner release; max physical lifetime3860ms, no early releases/binding gaps.2831 entry snapshots have exactly1 header marker, maxBODY+UNKNOWN3; observed IMAP4/BODY3/SMTP2. All30 origins and original450 queue anchors remain immutable, while latest auth changes through observed native workload.

Read-only terminal DB preserves public counts/digests/saved BODY hash and retained A21 physical1/runtime1. Own schema physical/runtime/body claims0.1046 started descendant PIDs have no surviving matching ticks;1044 exit counter receipts exist. Two native child JS exit-counter receipts are absent; their PIDs are absent. Missing counters are not invented. Worker joins and exact closure/release are recorded separately.

Three own-DB pg_stat_activity samples show actual FIRST(7,1) waiters and blockers/query_start; FIRST/SQL START/END monotonic durations are absent. Do not claim a precise wait duration, CPU cause or unique header cause. Frozen source/build/config229 files unchanged. Disk actual preheavy2114224128B; estimated extra output<=160MB was explicitly an estimate, WALunknown, raw actual35269147B. Later independent transient disk drops remain unexplained; no heavy follow-up was launched.

Profile model-routing-econom, HIGH diagnostic; actual model/usage/cost null because host exclusive metadata unavailable. Local scratch attempt persisted after initial instruction reads (telemetry sequencing gap), parent owns canonical project ledger. Source/database ownership released after terminal checks; no active background work claimed. Clean next planner pack contains approved inputs/current source/raw/objective facts and this legitimate HIGH plan, excludes author/verifier/coordinator reports, receipts/chat/working notes.
