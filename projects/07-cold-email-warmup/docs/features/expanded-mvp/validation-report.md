# Requirements Testability Analysis
Spec revision: sha256:dddb2cbdb5b3f7f54c7d63571ed7429b7abac1d42e6f8eb6ff8079dddc69979a

Verdict: CAVEATS
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT_ID: validate-r2
Source revision: 61ea349f
Review scope: bounded correction of N7-VAL-001 and revision binding; prior artifacts remain unchanged.

## Result
N7-VAL-001 is CLOSED for planning. The correction supplies a concrete server-owned admission and output oracle, labelled cases, numeric release thresholds and an independently authorized actual-model gate. No new blocking finding was identified in the requested corrective scope. The plan is ready for its applicable XL checkpoint and subsequent gated implementation; this is not implemented, model-evaluated or live-pilot acceptance.

CAVEATS are the already-declared conditions: source-bound implementation/protocol/concurrency tests; actual selected-model evaluation only with permission/budget; provider/arrival/retention proof; full-project pipeline input debt closure; separately authorized full-path pilot. This review does not demand live evidence to accept a PLAN. Proposed A1–A3 remain assumptions pending checkpoint and measurement.

## Closure evidence
- ai-policy-v1.md, supported-answer table: five finite FAQ intents and explicit approved fields/snippets. Unapproved prices, commitments, dates, meetings and legal claims are outside v1 autopilot.
- Deterministic oracle1–4: server chooses intent/topic/language and allowed snippet IDs from an owner-approved immutable tenant snapshot. The model cannot broaden scope or authorize sending. Exact required set matching and deterministic approved-byte assembly reject extra, foreign, missing or free-form output. Current policy/snapshot hashes are checked again at the existing final fence. Richer free-form drafts require exact-version HITL.
- Cases C01–C24:12 labelled supported positives and12 negative families, with all listed variants mandatory. Fixture inputs, policy/snapshot, model outputs and expected hashes freeze before execution; changes require a new version. Expected/actual IDs, admission, calls, eligibility and content checks form auditable evidence.
- Gates:0 unauthorized disclosure/commitment;100% correct negative HOLDs; at least11/12 useful positive SENDs (≥90%). Remaining positive failures must safely HOLD and remain visible. Local verifier/assembly tests are independent of the mock; actual-model evaluation separately records model/prompt/policy/snapshot/case versions and every attempt, with no cherry-picked rerun. Model gate does not replace live mail/SLO proof.
- Oracle5 and normative pseudocode correction: admission precedes generation, and generation errors/budget failures/quality holds cannot leave the original eligible denominator. Unsupported pre-admission traffic stays in total traffic with reasons.
- Specification NFR, architecture placement and pseudocode correction agree on global installation capacity30. Plan and pseudocode define nearest-rank p95 at ceil(0.95*N), with N0 unverifiable; all eligible error/unknown/overdue outcomes rank infinity. Plan/completion treat exactly300s as a miss, consistent with strict<300s.

The normative correction explicitly supersedes the former generic grounding formulation and the former possibility of deferring stronger output rules. No new platform or external action is required to express this repair.

## INVEST / SMART scoring
The original score method and unchanged-story assessment are retained; only the repaired US-106 is rescored. Each tuple is INVEST I/N/V/E/S/T then SMART S/M/A/R/T; quality is Traceability/Completeness. Generic benefit wording retains5/10 Valuable. Integration dependencies retain0 Independent. US-104 retains4 Small and3 Achievable; US-108 retains4 Estimable and3 Achievable because provider capacity/proof remains an assumption. Proposed bounds and numeric time/TTL limits supply timing context. The server-owned oracle makes US-106 estimable, measurable and testable; its remaining engineering integration is ordinary planned work.

| Story | INVEST /50 | SMART /30 | Quality /20 | Base /100 |
|---|---|---|---|---|
| US-101 |8/8/5/8/8/8=45|6/8/6/5/5=30|10/10=20|95|
| US-102 |8/8/5/8/8/8=45|6/8/6/5/5=30|10/10=20|95|
| US-103 |0/8/5/8/8/8=37|6/8/6/5/5=30|10/10=20|87|
| US-104 |0/8/5/8/4/8=33|6/8/3/5/5=27|10/10=20|80|
| US-105 |8/8/5/8/8/8=45|6/8/6/5/5=30|10/10=20|95|
| US-106 |0/8/5/8/8/8=37|6/8/6/5/5=30|10/10=20|87|
| US-107 |0/8/5/8/8/8=37|6/8/6/5/5=30|10/10=20|87|
| US-108 |0/8/5/4/8/8=33|6/8/3/5/5=27|10/10=20|80|
| US-109 |0/8/5/8/8/8=37|6/8/6/5/5=30|10/10=20|87|

Mean base88.1/100; security bonus+5/story, capped100, gives93.1/100. Growth bonus0 for this bounded delta review; inherited growth obligations remain regression requirements, not re-audited here. No zero Testable/Completeness/Traceability floor and no score<50. Scores concern requirement testability, not measured system performance. Current AC quotes below and the Criterion scenarios table are the nonzero artifact evidence.

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


## Current acceptance criteria quoted
### AC-expanded-mvp-001 — current quoted AC
> Given tenant с100 connected и30 active, When создаёт101-й и два worker одновременно активируют дополнительные, Then connected успешно создаётся без free/team cap, active≤30, лишние waiting_capacity; billing TEST semantics прежние.
> Связано: FR-expanded-mvp-001.
### AC-expanded-mvp-002 — current quoted AC
> Given allowlisted SMTP/IMAP endpoints и canary credentials, When diagnostics и fixtures TLS downgrade/DNS rebinding/AAD mismatch, Then SMTP/IMAP независимы, DATA=0, unsafe socket=0, no plaintext secret, только live-verified capability допускает live mode.
> Связано: FR-expanded-mvp-002.
### AC-expanded-mvp-003 — current quoted AC
> Given submitting crash/post-DATA timeout и UIDVALIDITY reset, When restart/replay, Then unknown_delivery не retries, quota retained, stop effects уникальны, cursor/page atomic и pause до полного rescan+tail; pre-DATA max3/120s сохраняется.
> Связано: FR-expanded-mvp-003.
### AC-expanded-mvp-004 — current quoted AC
> Given30 active ящиков трёх tenant с бюджетом, When workers работают/restart при pair conflict, Then due polls≤30s healthy, fair due round≤60s, pool allocation≤5min каждому eligible, pair/day≤1 и thread≤2; без peers waiting и0 sends.
> Связано: FR-expanded-mvp-004.
### AC-expanded-mvp-005 — current quoted AC
> Given matched incoming и oversized/foreign/injection/automatic/optout input, When ingest, Then campaign stop committed first, only own thread≤5 messages/64KiB and body≤32KiB, attachments/remote fetch0, unsupported hold; terminal body deletion≤24h and absolute TTL7days.
> Связано: FR-expanded-mvp-005.
### AC-expanded-mvp-006 — current quoted AC
> Given bounded own context и explicit content-processing consent, When generation or timeout/budget saturation/replay, Then one versioned draft per event/policy, no SMTP by model, input≤8000/output≤500 tokens, timeout30s/max2 safe attempts/65s total; changed draft invalidates prior approval and UI clearly shows pending/error/hold.
> Связано: FR-expanded-mvp-006. Дополнительно обязательны normative [ai-policy-v1](ai-policy-v1.md): deterministic intent/snapshot/snippet oracle и gates0 unauthorized,100% correct holds,≥90% useful supported answers; fixture pass не live model proof.
### AC-expanded-mvp-007 — current quoted AC
> Given separate unexpired policy scoped by mailbox/recipient/thread/intent/business context and approved draft hash or autopilot, When enqueue/revoke/suppress race, Then explicit ai_reply purpose uses all current final fence predicates, parent campaign stays stopped, quota shared, duplicate dispatch0 and post-boundary inflight limitation disclosed.
> Связано: FR-expanded-mvp-007. Дополнительно обязательны [ai-policy-v1](ai-policy-v1.md): exact approved assembly, no free-form autosend, immutable authority hashes и разрешённый actual-model gate до автопилота; ошибки/quality holds остаются в первоначальном eligible denominator.
### AC-expanded-mvp-008 — current quoted AC
> Given frozen7day pilot cohort300 eligible arrivals under A1 including outage/quota/error/unknown and missed deadlines, When report, Then each arrival remains counted, unknown/error/unfinished rank infinity, ≥95% proven accepted<300s and effective p95<300s required; all counts/p99/valid timestamp N published and unknown provenance never replaced by observed.
> Связано: FR-expanded-mvp-008.
### AC-expanded-mvp-009 — current quoted AC
> Given live gates absent/revoked or model budget exhausted, When workers/start/send, Then0 unauthorized external calls, explicit blocked state; TEST billing unchanged, kill switch wins final fence before submission, no secrets/body in audit; local fixtures and live readiness independently labelled.
> Связано: NFR-expanded-mvp-001.

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
Given permitted context and processing consent, When generation succeeds, Then one versioned draft appears, model sends0, input≤8000/output≤500 and provider calls obey30s/2 safe attempts/65s bounds. Given timeout with unknown billing or exhausted budget, Then reservation is retained as appropriate and no blind retry or cap overrun occurs. Given two workers replaying an event/policy, Then one durable draft authority exists. Given a changed draft, Then former approval is invalid. For autopilot, exact intent/topic/snippet-set match and deterministic approved-byte assembly are mandatory under ai-policy-v1; arbitrary model text is HITL only. The named C01–C24 cases and all variants provide the quality oracle.

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


## Corrective BDD — AI-CONTENT-GATE-R2
Given frozen own-tenant policy/snapshot and C01–C24 plus every listed variant, When independent admission/verifier/assembly fixtures execute, Then unauthorized disclosures/commitments equal0, all negative variants HOLD, and at least11/12 supported positives yield the exact approved useful output; a model confidence/intent label cannot override server admission. Given extra free-form/foreign/wrong snippet output, Then autosend0. Given changed snapshot/prompt/model/policy/cases version, Then old gate is invalid. Given actual-model execution is not separately authorized, Then no external call occurs and live model gate remains pending. Given authorized actual-model execution, Then the same frozen set/thresholds and all attempts are reported, independently of subsequent live mail/SLO acceptance.

Given an admitted supported event and later model error or wrong snippet selection, When the report is computed, Then eligible remains true and the hold/error contributes an SLO failure. Given300 eligible arrivals,285 latencies<300s and15 infinite outcomes, Then nearest-rank p95 is rank285; with284 timely, the timely ratio fails. Given latency exactly300s, Then it is a miss. Given active leases split among tenants total30, When another tenant requests activation, Then it waits under the same global capacity lock.

## Validation limits and next owner
Read only corrected frozen documents and inherited report, wrote only this new temporary artifact directory. No source edits, product tests, model calls, external research or new feature review. New spec hash and all9 exact AC scenario rows checked mechanically. Next owner: root coordinator, preserving the existing implementation/checkpoint/live gates. Original report remains valid only as historical evidence for its original SHA.
