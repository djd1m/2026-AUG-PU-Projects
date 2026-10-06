# F08 Requirements Testability Analysis
Spec revision: sha256:a3ad1300fde78f396c850627e9fd833391d3a572214801315519b92ad197a0a8

Verdict: READY for implementation — F08-V1 resolved in the plan; runtime acceptance remains pending.
Source revision: 8c2f4dc57aeb6b71f19b160755b4372d338f1ee1.
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1; WORK_UNIT_ID: f08-validate-r2.
Independent bounded requirements review; profile compact-quality-first-v2, substantive XL under OWN-N7-005. Requested gpt-6-astra/high; actual model/effort/usage/cost null because native host evidence is unavailable. No model switch or savings claim.

## Summary
One bounded user story, eight testable AC, no remaining confirmed blocking findings. Original F08-V1 NEEDS WORK report is preserved byte-for-byte at history/validation-report.pre-r2.md. This second pass reviews only its targeted correction; all unchanged first-pass analysis remains applicable. Core score96/100; security bonus+5 and existing growth trace+5 (outside core rubric; capped display100). The score describes testability, not protocol correctness or runtime success; it does not prove runtime correctness. Selected finite native Node22.20 AUTH-only states are implementable within the stated limits; expanding them into a general mail client is unnecessary for F08.

## INVEST and SMART
| Dimension | Points | Basis |
|---|---:|---|
| Independent | 8/8 | Accepted mailbox/tenant/storage interfaces exist; F09 send and UID work is excluded. |
| Negotiable | 8/8 | Internal file split remains flexible; fixed safety boundaries implement accepted owner policy. |
| Valuable | 10/10 | Owner sees separate TLS/auth diagnosis without enabling warmup. |
| Estimable | 4/8 | Commands, limits and persistence are specified; native parser/fixture effort still needs implementation evidence. |
| Small | 8/8 | Three connection variants, PLAIN only, one current snapshot, no general transport engine. |
| Testable | 8/8 | All eight source AC are quoted below and mapped to named scenarios. |
| Specific | 6/6 | Authority, errors, modes, locks and command prohibitions are explicit. |
| Measurable | 8/8 | 2/process,1/mailbox,30s total,10s phase,64KiB total,8KiB line,32 DNS answers. |
| Achievable | 6/6 | Bounded app buffers and owned handles are asserted; no impossible RSS/JS zeroization promise. |
| Relevant | 5/5 | Independent diagnostics answer the story without changing capacity/consent. |
| Time-bound | 5/5 | DNS included in shared deadline and post-lock clock used for expiry. |
| Traceability | 10/10 | This report's Criterion scenarios table covers every declared AC. |
| Completeness | 10/10 | Quoted AC plus scenarios cover successes, failures, hostile peers and concurrency edges. |

Security criteria explicitly cover session, Origin, tenant, AEAD, grant scope, SSRF/TLS, injection, admission and scrubbed sinks. Growth is inherited rather than expanded: product-discovery-brief.md seed FR-GROWTH-001..004 all occur in docs/Specification.md. No new acquisition requirement is invented.

## Criterion scenarios
| Criterion | Scenario |
|---|---|
| AC-f08-live-diagnostics-001 | scenarios.md — `Scenario Outline: F08 authority and ownership precede side effects` |
| AC-f08-live-diagnostics-002 | scenarios.md — `Scenario Outline: F08 DNS and TLS reject unsafe peers before authentication` |
| AC-f08-live-diagnostics-003 | scenarios.md — `Scenario Outline: F08 SMTP and IMAP outcomes remain independent` |
| AC-f08-live-diagnostics-004 | scenarios.md — `Scenario Outline: F08 resources cancel and settle exactly once` |
| AC-f08-live-diagnostics-005 | scenarios.md — `Scenario Outline: F08 current revision fences every stale completion` |
| AC-f08-live-diagnostics-006 | scenarios.md — `Scenario Outline: F08 AEAD and secret canaries never escape` |
| AC-f08-live-diagnostics-007 | scenarios.md — `Scenario Outline: F08 UI reports evidence mode and current state truthfully` |
| AC-f08-live-diagnostics-008 | scenarios.md — `Scenario: F08 acceptance uses real fixtures and preserves regressions` |

Additional named scenarios in scenarios.md cover fixture isolation, rebinding/STARTTLS, exact byte boundaries/admission, transaction ordering/rollback and input injection. These are derived BDD requirements, not existing executable tests.

## Source AC evidence
The following quotations bind nonzero Testable and Completeness to actual requirements rather than an inferred ideal:

- **AC-f08-live-diagnostics-001** (`01_specification.md`, matching heading): “[SC-F08-001]
Given credentials exist but no current operator diagnostic authorization, When own POST /api/mailboxes/:id/diagnostics is requested, Then return503 live_provider_disabled with zero DNS/socket calls. Given a forged session, wrong Origin or foreign id, When this route is called, Then existing401/403/404 applies before decrypt/DNS and zero writes/connections occur. Authorized local fixture construction is test-only dependency injection and cannot be selected by HTTP/env in deployed main. A separately authorized operator grant binds diagnostic-only scope, approved tenant/mailbox IDs, endpoint tuples, revision and expiry; neither credentials nor allowlist alone authorize external authentication.”

- **AC-f08-live-diagnostics-002** (`01_specification.md`, matching heading): “[SC-F08-002]
Given an authorized own request, When DNS contains any unsafe/mixed private address, an invalid family, zero or >32 answers, Then reject before connect; resolve afresh per protocol/attempt, connect only chosen numeric IP with original hostname/SNI and certificate verification. Given invalid/expired/untrusted/wrong-host certificate, absent STARTTLS, failed TLS upgrade or TLS below1.2, Then fail closed before AUTH with no retry/fallback. Resolver changes after pinning cannot redirect the actual connection; production disallows private fixture addresses.”

- **AC-f08-live-diagnostics-003** (`01_specification.md`, matching heading): “[SC-F08-003]
Given one protocol rejects authentication and the other accepts, When diagnostics run, Then both complete independently with distinct protocol, TLS, auth and typed failure fields; no failure masks the other result. SMTP requires EHLO and advertised AUTH PLAIN after verified TLS, accepts only235 for AUTH. IMAP requires OK greeting and advertised AUTH=PLAIN, authenticates using a tagged command and accepts only its tagged OK. PREAUTH is unsupported (does not prove submitted credentials). Unsupported auth is a visible failure, never success. Transcript contains zero message/envelope/mailbox-read/write commands. Closing after authenticated result is bounded and never changes success into fabricated delivery.”

- **AC-f08-live-diagnostics-004** (`01_specification.md`, matching heading): “[SC-F08-004]
Given stalled DNS/connect/TLS/greeting/auth, slow trickle, huge multiline or unterminated responses, When production adapter runs, Then each protocol ends within30s total including DNS; DNS/connect/TLS/greeting/auth each have at most10s, constrained by remaining total. Concurrent protocols share a30s request deadline. At most2 diagnostic requests per process and1 per mailbox are admitted; excess returns429 without sockets; no waiting queue. Receive cap64KiB total/protocol and8KiB/line is checked on bytes before concatenation/decoding. Overflow, malformed framing, unsolicited literal or abort destroys all owned raw/TLS sockets, clears timers/listeners and settles exactly once; no late callback publishes success. No automatic retry. Resource measurements include zero active handles owned by adapter after completion, not a fabricated hard RSS ceiling.”

- **AC-f08-live-diagnostics-005** (`01_specification.md`, matching heading): “[SC-F08-005]
Given diagnostics in flight, When credentials/settings are replaced, any mailbox stop/quarantine runs, a newer diagnostic attempt starts, or operator grant/config is revoked/changed/expired, Then stale completion cannot publish current verified evidence or revive state/capacity/consent/jobs. Every DB eligibility writer acquires advisory_xact_lock(7,1) FIRST; diagnostic begin/finish are short transactions with network outside. An additive monotonic mailbox diagnostic_revision and attempt UUID fence even identical settings replacements and stop→resume ABA. Final commit rechecks own identity, revision, attempt, nonstopped state, provider-config/grant fingerprint and DB clock after lock. Mismatch returns409 mailbox_changed (or503 disabled grant) with no current capability update. Existing shared cancelMailbox releases capacity and cancels only queued/claimed, preserving submitting/unknown semantics.”

- **AC-f08-live-diagnostics-006** (`01_specification.md`, matching heading): “[SC-F08-006]
Given tampered envelope, unknown key, foreign tenant/mailbox AAD or credential/server-error canaries, When diagnostics run, Then AEAD failure opens zero sockets; no canary plaintext appears in API, UI, DB diagnostic fields, logs, telemetry or exception text. Existing tenant/mailbox/version AAD and Argon2id parameters stay unchanged. Store only allowlisted typed statuses, phase, checked time, opaque attempt/revision/config fingerprint and evidence mode; no response text, username, password, message body or TLS key material. Credentials are held only for the bounded operation and references released on all exits; no claim of guaranteed JavaScript memory zeroization.”

- **AC-f08-live-diagnostics-007** (`01_specification.md`, matching heading): “[SC-F08-007]
Given independently successful/failed, pending, disabled, stale or never-run results, When owner opens mailbox details or reloads, Then SMTP and IMAP each show mode, TLS/auth outcome, checked time and typed explanation; stale results are visibly unusable and never labelled live verified. Only successful authorized external diagnostics may use evidenceMode=live_provider; local real-TLS fixtures use protocol_fixture and legacy verify-test uses local_test. Button is keyboard accessible, busy state prevents duplicate clicks and results are announced without secrets; desktop1440/mobile390 preserve separate capacity/waiting and unchecked consent controls. API successful execution returns200 with per-protocol outcomes even for authentication failures; infrastructure/authorization errors retain typed HTTP codes.”

- **AC-f08-live-diagnostics-008** (`01_specification.md`, matching heading): “[SC-F08-008]
Given real local TLS SMTP465/587 and IMAP993 servers plus PostgreSQL16, When the actual production adapter and API/store paths execute positive, hostile, cancellation and revision races, Then all prior criteria have source-bound witnesses, including parent test title `live diagnostics enforce pinned TLS without DATA`. A mocked connect success alone cannot pass. Additive schema12→13 preserves encrypted data/state and produces no verified diagnostic/lease/consent backfill. Existing unit/PG/security/dispatch/billing/capacity suites, typecheck/lint/build and relevant Docker browser pass; mutations disabling hostname enforcement, receive cap or revision predicate fail their actual guards. F07 global30/lease120/null mailbox plans, campaign3/10, TEST100minorRUB/30days, post-lock UTC quota and unknown_delivery no-blind-retry remain regressions. F08 does not claim F09–F15 or whole expanded acceptance.”

## Cross-document and source inspection
Read all six F08 plan documents and existing src/mailboxes/network.ts, provider.ts, input.ts, store.ts, src/config.ts, src/server.ts, src/consent/transaction.ts and shared quarantine callsites. Existing resolveEndpoint validates all answers but alone is not the new cancellable TLS adapter. Existing verifyTest is sequential local_test and must not be re-labelled authentic evidence. Existing cancelMailbox centralizes replacement/stop/quarantine cancellation; it is the required revision invalidation seam. eligibilityTransaction already takes global lock first. Save/change settings paths need explicit revision coverage, including same-value replacements; implementation tests must prove this rather than infer it from ciphertext equality.

### F08-V1 — resolved at plan revision 8c2f4dc57aeb6b71f19b160755b4372d338f1ee1

Original high finding: mutable file fingerprints did not order operator grant/config revocation against final diagnostic publication. Prior report and original evidence remain in `history/validation-report.pre-r2.md`; the specification and scenarios have not changed.

Independent disposition: RESOLVED in the requirements/architecture contract. `03_architecture.md` → Operator publication and failure boundary — F08-V1 now places authority in one durable diagnostic_authority row with monotonic authority_revision, scope/config fingerprint, expiry and active/revoked state. Privileged publish/revoke and diagnostic begin/finish all use existing eligibilityTransaction with global lock(7,1) FIRST, then authority row and mailbox. Expected revision rejects stale publication; identical-data publication increments revision. Operator file parsing is bounded and outside the transaction, and file existence is explicitly not live authority.

`02_pseudocode.md` → Fence evidence against current database state gives both serial orders: revoke commits first → final snapshot revision fails; finalization commits first → later revoke makes its historical observation noncurrent. Project diagnostic truth to owner joins current durable authority and post-lock expiry semantics without a cached verified flag. `04_refinement.md` → F08-V1 targeted race and failure witnesses explicitly tests a waiter before lock, revoke blocked after final authority read, identical republish ABA, invalid/missing file input, expected-revision conflict and transaction rollback. `05_completion.md` requires committed revoke revision evidence for operations/rollback. Database failure is never reported as a successful revoke; diagnostics fail closed when their authority read/write is unavailable.

The original `Scenario: F08 grant revocation is ordered with final publication` already covers both orders and remains unchanged. Input-file editing/removal alone is now explicitly not a committed revoke; an authorized publish with invalid/missing input commits a revoke at its expected revision and then reports the typed input failure. This makes the publication point observable without a watcher or a new service. No mailbox-wide rewrite, external network call under lock, broader control plane or weakened AC was introduced.

This is design revalidation only. IMPLEMENT must produce the specified real-PG ordering, current-projection and rollback witnesses; no authority implementation or runtime test pass is inferred from the documentation.

Other mandatory implementation watchpoints are already requirements: counters must be process singletons; per-process admission does not claim distributed exclusivity; cross-process overlap is fenced durably. Do not reuse the current independent deadline helper without propagating the shared remaining budget. Native TLS capability citations establish available APIs only; this validation did not re-fetch or certify dependency security. Real local TLS and adversarial parser tests decide correctness.

## Gates and acceptance boundary
Run installed full-project --traceability --report-revision --criterion-scenarios with explicit root role maps; raw evidence /tmp/n7-f08-validate-r2-phase12.txt. Gate results are recorded in the terminal receipt. Required advancing result is exit0. No selected snapshot is presented as the full project.

Runtime suites, build, schema12→13, mutations and Docker browser are not_applicable to this docs-only validation and remain mandatory IMPLEMENT/REVIEW work. Companion E2E preflight is not_applicable because no E2E is run. Planned completion rows are not executable-test evidence; F06 B5/B6 and future expanded acceptance remain Phase3 debt, not Phase1/2 blockers. No live provider, new dependency, paid API, sending or deployment is authorized or performed.

## Input and scenario hashes
- `01_specification.md`: `a3ad1300fde78f396c850627e9fd833391d3a572214801315519b92ad197a0a8`
- `02_pseudocode.md`: `c9720a7e3f0dd7134e1d09386328250332b86981dd0224940351a7227e3f6321`
- `03_architecture.md`: `6504e68afcc5466e582904d0f86b88b1f46e2807fcceea0c5f5cc14b1781c6d0`
- `04_refinement.md`: `fb409427b883001cb9636029b2f22ce9d2987d2fd1884ef27e6f70132095d8f7`
- `05_completion.md`: `d41c7592f15d35cf43ca621cab61765ef4b83a7edf080e2c127806ed62f4dd6e`
- `capability-contracts.md`: `6c91d0b611c24a9129dda339d9ed9b12000889bc53691879d8f17f821f4e8fb4`
- `scenarios.md`: `d5471acb0f5e57bd6462470357064a4db690d8edd649722af6d6d4fe07d8adab`
- `history/validation-report.pre-r2.md`: `ec02efb1090671519b9feb6871d360716c8671da3eedd3f4e72fcee94e29708a`
