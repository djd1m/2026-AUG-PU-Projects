# Requirements Testability Analysis
Spec revision: sha256:09ba7b742094e0e5e22c27010ebcb4d7155de2c406772c0c589a795bae6f1a5b

Verdict: NEEDS WORK
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT_ID: validate-1
Source revision: 98d4418c
Scope: frozen planning artifacts only; no code, runtime acceptance or external calls.

## Summary
Nine stories and nine AC reviewed. One material blocker: N7-VAL-001, missing a concrete AI output/intent acceptance oracle and a release evaluation gate for mandatory autopilot. Repair is a short policy/case table and measurable checks, not a new evaluation platform. Other slices can continue preparation; this verdict does not authorize implementation before the XL checkpoint or external live work.

Raw weighted testability score: 85.9/100 (mean of nine stories). Security bonus +5/story gives 90.9/100 after capping at100. Growth bonus0: no acquisition delta is introduced; inherited growth obligations explicitly remain regression requirements, and this review did not re-audit the discovery brief. Numeric testability is not proof of safe autopilot: the material finding overrides a READY interpretation. No story hits the score<50 or zero-AC/zero-traceability floor.

## Scoring
Each tuple lists INVEST I/N/V/E/S/T, then SMART S/M/A/R/T; quality is Traceability/Completeness. Generic user benefit “чтобы получить проверяемый безопасный результат” receives5/10 Valuable rather than full credit. Dependencies receive0 Independent, rather than pretending the integration stories are standalone. Negotiable8 reflects explicitly proposed assumptions and bounded implementation choices. Small8 reflects individual slices, not the entire XL feature; persistent runtime receives4 because of its scheduler/recovery/performance scope. These are review judgements, not measured development duration.

| Story | INVEST points /50 | SMART points /30 | Quality /20 | Base score | Status |
|---|---|---|---|---|---|
| US-101 | 8/8/5/8/8/8 =45 | 6/8/6/5/5 =30 |10/10=20|95|READY subject to existing gates|
| US-102 | 8/8/5/8/8/8 =45 | 6/8/6/5/5 =30 |10/10=20|95|CAVEATS: capability documentation gate|
| US-103 | 0/8/5/8/8/8 =37 | 6/8/6/5/5 =30 |10/10=20|87|CAVEATS: capability documentation gate|
| US-104 | 0/8/5/8/4/8 =33 | 6/8/3/5/5 =27 |10/10=20|80|CAVEATS: A1 performance assumption|
| US-105 | 8/8/5/8/8/8 =45 | 6/8/6/5/5 =30 |10/10=20|95|READY subject to existing gates|
| US-106 | 0/8/5/4/8/4 =29 | 4/4/3/5/5 =21 |10/7=17|67|NEEDS WORK: N7-VAL-001|
| US-107 | 0/8/5/8/8/8 =37 | 6/8/6/5/5 =30 |10/10=20|87|CAVEATS: depends on US-106 policy gate|
| US-108 | 0/8/5/4/8/8 =33 | 6/8/3/5/5 =27 |10/10=20|80|CAVEATS: provider proof and pilot required|
| US-109 | 0/8/5/8/8/8 =37 | 6/8/6/5/5 =30 |10/10=20|87|READY subject to existing gates|

US-106 deductions reflect unspecified supported intents, meaning of grounded/uncertain, and missing quality evaluation pass/fail rule. US-104/108 Achievable3 recognizes an unbenchmarked proposed capacity and a provider-dependent seven-day target; neither is impossible. Time bounds include existing transport/retry rules and A1–A3, which the specification incorporates normatively.

## Criterion scenarios
| Criterion | Scenario |
|-----------|----------|
| AC-expanded-mvp-001 | SC-US-101-1 — Unlimited connections and atomic admission |
| AC-expanded-mvp-002 | SC-US-102-1 — Independent pinned diagnostics without DATA |
| AC-expanded-mvp-003 | SC-US-103-1 — Ambiguous delivery and UID reset recovery |
| AC-expanded-mvp-004 | SC-US-104-1 — Fair persistent runtime and absent peers |
| AC-expanded-mvp-005 | SC-US-105-1 — Stop-first bounded tenant context and expiry |
| AC-expanded-mvp-006 | SC-US-106-1 — Consent-bound versioned drafts and bounded generation |
| AC-expanded-mvp-007 | SC-US-107-1 — Independent reply authority and revoke races |
| AC-expanded-mvp-008 | SC-US-108-1 — Full denominator and trusted arrival SLO |
| AC-expanded-mvp-009 | SC-US-109-1 — Independent live gates and kill switch |

## Acceptance evidence quoted from the reviewed specification
The following verbatim AC excerpts ground nonzero Testable/Completeness scores; headings refer to01_specification.md. Full original Given/When clauses are present at each heading. Traceability evidence is this report’s Criterion scenarios table. Planned BDD below extends those clauses; it is not executed evidence.

### AC-expanded-mvp-001 — quoted AC
> Given tenant с100 connected и30 active, When создаёт101-й и два worker одновременно активируют дополнительные, Then connected успешно создаётся без free/team cap, active≤30, лишние waiting_capacity; billing TEST semantics прежние.

### AC-expanded-mvp-002 — quoted AC
> Given allowlisted SMTP/IMAP endpoints и canary credentials, When diagnostics и fixtures TLS downgrade/DNS rebinding/AAD mismatch, Then SMTP/IMAP независимы, DATA=0, unsafe socket=0, no plaintext secret, только live-verified capability допускает live mode.

### AC-expanded-mvp-003 — quoted AC
> Given submitting crash/post-DATA timeout и UIDVALIDITY reset, When restart/replay, Then unknown_delivery не retries, quota retained, stop effects уникальны, cursor/page atomic и pause до полного rescan+tail; pre-DATA max3/120s сохраняется.

### AC-expanded-mvp-004 — quoted AC
> Given30 active ящиков трёх tenant с бюджетом, When workers работают/restart при pair conflict, Then due polls≤30s healthy, fair due round≤60s, pool allocation≤5min каждому eligible, pair/day≤1 и thread≤2; без peers waiting и0 sends.

### AC-expanded-mvp-005 — quoted AC
> Given matched incoming и oversized/foreign/injection/automatic/optout input, When ingest, Then campaign stop committed first, only own thread≤5 messages/64KiB and body≤32KiB, attachments/remote fetch0, unsupported hold; terminal body deletion≤24h and absolute TTL7days.

### AC-expanded-mvp-006 — quoted AC
> Given bounded own context и explicit content-processing consent, When generation or timeout/budget saturation/replay, Then one versioned draft per event/policy, no SMTP by model, input≤8000/output≤500 tokens, timeout30s/max2 safe attempts/65s total; changed draft invalidates prior approval and UI clearly shows pending/error/hold.

### AC-expanded-mvp-007 — quoted AC
> Given separate unexpired policy scoped by mailbox/recipient/thread/intent/business context and approved draft hash or autopilot, When enqueue/revoke/suppress race, Then explicit ai_reply purpose uses all current final fence predicates, parent campaign stays stopped, quota shared, duplicate dispatch0 and post-boundary inflight limitation disclosed.

### AC-expanded-mvp-008 — quoted AC
> Given frozen7day pilot cohort300 eligible arrivals under A1 including outage/quota/error/unknown and missed deadlines, When report, Then each arrival remains counted, unknown/error/unfinished rank infinity, ≥95% proven accepted<300s and effective p95<300s required; all counts/p99/valid timestamp N published and unknown provenance never replaced by observed.

### AC-expanded-mvp-009 — quoted AC
> Given live gates absent/revoked or model budget exhausted, When workers/start/send, Then0 unauthorized external calls, explicit blocked state; TEST billing unchanged, kill switch wins final fence before submission, no secrets/body in audit; local fixtures and live readiness independently labelled.

## Named BDD scenarios
### SC-US-101-1 — Unlimited connections and atomic admission
Given100 connected and30 active with two competing activation requests, When the101st mailbox is saved and requests run concurrently, Then save succeeds, active count stays≤30 and excess wait visibly; TEST entitlements retain their original semantics. Given an expired capacity lease, When its work and replacement activation race, Then total active work must still respect the same bound; test the implementation's lease enforcement, not only a row count.

### SC-US-102-1 — Independent pinned diagnostics without DATA
Given approved canary endpoints, When each protocol succeeds/fails independently, Then its own status is recorded and SMTP DATA count is0. Given rebinding, prohibited IP, certificate mismatch, downgrade or foreign AAD, When verify/reconnect runs, Then unsafe socket/secret disclosure count is0 and no live capability is granted. Given prior local verification, When live mode is requested, Then local evidence cannot satisfy live verification.

### SC-US-103-1 — Ambiguous delivery and UID reset recovery
Given a proven final SMTP acceptance, When completion persists, Then outcome is accepted exactly once. Given crash or timeout after possible DATA, When recovery runs, Then unknown_delivery retains quota and never retries. Given a proven pre-DATA transient, When retried, Then canonical max3/120s applies. Given UIDVALIDITY reset and replay, When page/cursor commit or process crashes, Then unique stop effects survive and sending stays paused until full rescan plus tail completes.

### SC-US-104-1 — Fair persistent runtime and absent peers
Given30 active across3 tenants, including a noisy tenant and first-pair conflict, When poll/pool/dispatch/AI loops contend and restart, Then healthy poll cadence≤30s, due round≤60s and eligible pool allocation≤5min; conflict advances the cursor. Given long rescan/provider cooldown, Then healthy mailboxes retain reserved poll capacity and limits remain enforced. Given no opted-in peer, Then waiting is visible and sends0. Pair/day≤1 and thread≤2 hold through concurrent workers.

### SC-US-105-1 — Stop-first bounded tenant context and expiry
Given correlated incoming mail, When ingestion runs, Then campaign stop commits before AI work. Given foreign references, optout, bounce, OOO, bulk/loop or oversized input, When parsed, Then reject/hold/suppress as applicable; no unauthorized generation or fetch. Given6 messages,32KiB+1 body or64KiB+1 thread, Then bounds apply before full buffering. Given terminal+24h or pending+7days, When cleanup/read runs, Then body/draft are unavailable/deleted under the stated TTL; metadata contains no body.

### SC-US-106-1 — Consent-bound versioned drafts and bounded generation
Given permitted context and processing consent, When generation succeeds, Then one versioned draft appears, model sends0, input≤8000/output≤500 and provider calls obey30s/2 safe attempts/65s bounds. Given timeout with unknown billing or exhausted budget, Then reservation is retained as appropriate and no blind retry or cap overrun occurs. Given two workers replaying an event/policy, Then one durable draft authority exists. Given a changed draft, Then former approval is invalid. Quality/grounding pass cases remain incomplete until N7-VAL-001 is repaired; this is explicitly not a claimed complete AI oracle.

### SC-US-107-1 — Independent reply authority and revoke races
Given stopped parent and separately scoped current policy with exact approved hash or autopilot, When enqueue/final fence runs, Then exactly one ai_reply uses shared quota and parent remains stopped. Given stale hash, wrong thread/recipient/intent, expired policy or suppression/revoke before submitting commit, Then socket calls0. Given revoke after submitting commit, Then documented in-flight limitation applies and later jobs cancel. Concurrent approval/edit/revoke and midnight quota transitions must retain global(7,1) first ordering.

### SC-US-108-1 — Full denominator and trusted arrival SLO
Given frozen300 eligible arrivals over7days, including late/error/unknown/pending events, When reporting, Then none disappears and unfinished/error/unknown ranks infinity; publish all counts, p95/p99, maximum, valid timestamp N and reasons. Given285 proven latencies<300s and15 infinite outcomes, Then nearest-rank p95 would be the285th result; report the chosen deterministic quantile convention. Given only284 timely, Then timely ratio fails. Given unknown arrival provenance, Then unconditional arrival-SLO is unverifiable regardless of the numeric quantile. Given manual approval delay, Then full time includes it and draft latency remains separately labelled. Actual SMTP accepted requires final post-DATA reply, not merely a queued draft.

### SC-US-109-1 — Independent live gates and kill switch
Given absent/expired/revoked operator gate or missing relevant processing authorization, When any external action is attempted, Then unauthorized calls0 and visible blocked status. Given exhausted LLM budget, Then generation is blocked; independently authorized polling need not stop. Given kill switch before final submitting commit, Then new send0; fixture acceptance cannot enable live mode. Given audits and TEST payment workflows, Then no body/secrets or real charge is introduced.

## Mandatory security BDD supplement
- AUTH-BYPASS: Given missing/expired session or foreign Origin, When mailbox verify, AI policy, approve or metrics APIs are called, Then existing authorization denies before any external call or secret read.
- INPUT-INJECTION: Given SQL metacharacters, HTML/script markup, CRLF headers and command strings in mailbox/context/draft inputs, When persisted/rendered/sent, Then no query/HTML/command/header interpretation changes authority or structure; invalid content rejects/holds. Malicious email instructions cannot request tools, broaden recipients or obtain context outside the approved fields.
- TENANT-ISOLATION: Given tenantA session and tenantB mailbox/event/draft IDs, When reads, approvals or policy edits are attempted, Then foreign records remain undisclosed and no state changes or calls occur.
- AUTH-RATE-REGRESSION: Given repeated concurrent login attempts, When inherited authentication runs, Then its existing bounded Argon2id/antiabuse limits remain intact. No new auth endpoint is planned; this is inherited regression coverage.

## Realizability and material caveats
A1 is finite and arithmetically possible:300 events/7days≈43/day across30 active mailboxes, below the aggregate default300/day before other purposes. That is not proof that quotas remain available; warmup/campaign/AI share the same ledger and pilot traffic must reserve the stated budget without cap escalation. Burst6 with LLM concurrency2 and generation bound65s can plausibly fit a300s target but requires the planned load test including polling, queueing, SMTP and provider latency. Four IMAP slots polling30 mailboxes each30s imply a rough average4s service budget per mailbox absent other work; slow providers/rescans are a real benchmark dependency already recognized in the plan.

Admission30 is read as a deployment-wide bound from the architecture, with tenant quotas/fairness subordinate. Implementation must make that scope and lease-expiry behavior explicit. Test31st active across different tenants as well as within one tenant.

SLO denominator policy is sound: fixed eligibility, failure infinity, trusted server arrival, unknown provenance, manual delay and SMTP acceptance semantics are distinct. Pick a deterministic quantile convention in the reporting implementation so300-sample edge cases cannot differ between tools. No completed-only or draft-only substitute is accepted. Provider timing proof and the chosen account's semantics remain a live prerequisite, not an established capability.

Security authority is separated correctly: model has no tools/SMTP, tenant-bound approved context, separate content consent and autopilot policy, final stop fence, global lock first, shared quota and no blind retry. Local content TTL is explicit; remote OpenAI retention/data-handling verification is already an UNCONFIRMED gated dependency and cannot be inferred from local deletion. The remaining material AI policy/evaluation gap is N7-VAL-001.

Existing original-scope rotation/sequences/personalization/pool/partners/consent/suppression/complaints are expressly retained through FR-n7/AC-N7 regression requirements. No new Nest/BullMQ/Redis platform is proposed. Inherited full-project traceability exit2 is disclosed and must close before IMPLEMENT; selected-feature checks cannot replace it. No runtime or live acceptance was performed in this validation.
