# F08 — независимая безопасная диагностика SMTP/IMAP

PLAN, AUTO; source e61006749f69bd352759c7520f2a7e99aef24bd2, 2026-10-06.
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1; WORK_UNIT_ID: f08-plan-a1.
Owner approval OWN-N7-005 covers expanded MVP and this bounded slice. Inherited XL remains: credential security and external I/O. Coordinator prospective-runtime route S/0; this docs-only route T/0 are mechanical lower bounds. Workflow /run mvp → /next F08 after accepted F07 → /go → /feature AUTO. Independent VALIDATE and IMPLEMENT/REVIEW are pending.

User story: владелец видит отдельно, прошли ли SMTP и IMAP TLS и аутентификацию, без отправки письма и без автоматического разрешения прогрева. This refines parent AC-expanded-mvp-002 only. Approved brief/research/solution are inherited from expanded-mvp; no new Explore or competitor research. AI policy v1 remains future F12/F13; credentials never become model context.

## Scope and limits

Add a narrow native Node22.20.0 protocol adapter (see capability-contracts.md), additive diagnostic persistence, own-mailbox API and truthful UI. SMTP465 implicit TLS, SMTP587 mandatory STARTTLS, IMAP993 implicit TLS; password/app-password AUTH PLAIN only, unsupported mechanisms reported explicitly. No OAuth promise, general mail client, SMTP MAIL/RCPT/DATA/BDAT, IMAP SELECT/EXAMINE/FETCH/APPEND/STORE, send worker, UID polling or provider pilot in F08. F09 reuses safe connection primitive after its own source/contracts/fixtures.

Registration, diagnostic evidence, active capacity, consent and live action authority are separate. Existing verify-test stays explicitly local_test. A local protocol fixture is production-adapter evidence, never live provider verification. Diagnostic success does not change mailbox.state to verified_test, grant consent, reserve capacity/quota, schedule work or enable dispatch/poll. Existing F07 capacity requires its current state predicate until a later accepted integration explicitly changes it.

### AC-f08-live-diagnostics-001 — explicit authority and ownership

[SC-F08-001]
Given credentials exist but no current operator diagnostic authorization, When own POST /api/mailboxes/:id/diagnostics is requested, Then return503 live_provider_disabled with zero DNS/socket calls. Given a forged session, wrong Origin or foreign id, When this route is called, Then existing401/403/404 applies before decrypt/DNS and zero writes/connections occur. Authorized local fixture construction is test-only dependency injection and cannot be selected by HTTP/env in deployed main. A separately authorized operator grant binds diagnostic-only scope, approved tenant/mailbox IDs, endpoint tuples, revision and expiry; neither credentials nor allowlist alone authorize external authentication.

### AC-f08-live-diagnostics-002 — endpoint and TLS pinning

[SC-F08-002]
Given an authorized own request, When DNS contains any unsafe/mixed private address, an invalid family, zero or >32 answers, Then reject before connect; resolve afresh per protocol/attempt, connect only chosen numeric IP with original hostname/SNI and certificate verification. Given invalid/expired/untrusted/wrong-host certificate, absent STARTTLS, failed TLS upgrade or TLS below1.2, Then fail closed before AUTH with no retry/fallback. Resolver changes after pinning cannot redirect the actual connection; production disallows private fixture addresses.

### AC-f08-live-diagnostics-003 — independent authentic diagnostics without mail

[SC-F08-003]
Given one protocol rejects authentication and the other accepts, When diagnostics run, Then both complete independently with distinct protocol, TLS, auth and typed failure fields; no failure masks the other result. SMTP requires EHLO and advertised AUTH PLAIN after verified TLS, accepts only235 for AUTH. IMAP requires OK greeting and advertised AUTH=PLAIN, authenticates using a tagged command and accepts only its tagged OK. PREAUTH is unsupported (does not prove submitted credentials). Unsupported auth is a visible failure, never success. Transcript contains zero message/envelope/mailbox-read/write commands. Closing after authenticated result is bounded and never changes success into fabricated delivery.

### AC-f08-live-diagnostics-004 — finite resources and cancellation

[SC-F08-004]
Given stalled DNS/connect/TLS/greeting/auth, slow trickle, huge multiline or unterminated responses, When production adapter runs, Then each protocol ends within30s total including DNS; DNS/connect/TLS/greeting/auth each have at most10s, constrained by remaining total. Concurrent protocols share a30s request deadline. At most2 diagnostic requests per process and1 per mailbox are admitted; excess returns429 without sockets; no waiting queue. Receive cap64KiB total/protocol and8KiB/line is checked on bytes before concatenation/decoding. Overflow, malformed framing, unsolicited literal or abort destroys all owned raw/TLS sockets, clears timers/listeners and settles exactly once; no late callback publishes success. No automatic retry. Resource measurements include zero active handles owned by adapter after completion, not a fabricated hard RSS ceiling.

### AC-f08-live-diagnostics-005 — current revision and stop fence

[SC-F08-005]
Given diagnostics in flight, When credentials/settings are replaced, any mailbox stop/quarantine runs, a newer diagnostic attempt starts, or operator grant/config is revoked/changed/expired, Then stale completion cannot publish current verified evidence or revive state/capacity/consent/jobs. Every DB eligibility writer acquires advisory_xact_lock(7,1) FIRST; diagnostic begin/finish are short transactions with network outside. An additive monotonic mailbox diagnostic_revision and attempt UUID fence even identical settings replacements and stop→resume ABA. Final commit rechecks own identity, revision, attempt, nonstopped state, provider-config/grant fingerprint and DB clock after lock. Mismatch returns409 mailbox_changed (or503 disabled grant) with no current capability update. Existing shared cancelMailbox releases capacity and cancels only queued/claimed, preserving submitting/unknown semantics.

### AC-f08-live-diagnostics-006 — AEAD and scrubbed persistence

[SC-F08-006]
Given tampered envelope, unknown key, foreign tenant/mailbox AAD or credential/server-error canaries, When diagnostics run, Then AEAD failure opens zero sockets; no canary plaintext appears in API, UI, DB diagnostic fields, logs, telemetry or exception text. Existing tenant/mailbox/version AAD and Argon2id parameters stay unchanged. Store only allowlisted typed statuses, phase, checked time, opaque attempt/revision/config fingerprint and evidence mode; no response text, username, password, message body or TLS key material. Credentials are held only for the bounded operation and references released on all exits; no claim of guaranteed JavaScript memory zeroization.

### AC-f08-live-diagnostics-007 — truthful accessible API/UI

[SC-F08-007]
Given independently successful/failed, pending, disabled, stale or never-run results, When owner opens mailbox details or reloads, Then SMTP and IMAP each show mode, TLS/auth outcome, checked time and typed explanation; stale results are visibly unusable and never labelled live verified. Only successful authorized external diagnostics may use evidenceMode=live_provider; local real-TLS fixtures use protocol_fixture and legacy verify-test uses local_test. Button is keyboard accessible, busy state prevents duplicate clicks and results are announced without secrets; desktop1440/mobile390 preserve separate capacity/waiting and unchecked consent controls. API successful execution returns200 with per-protocol outcomes even for authentication failures; infrastructure/authorization errors retain typed HTTP codes.

### AC-f08-live-diagnostics-008 — production-adapter acceptance and regression

[SC-F08-008]
Given real local TLS SMTP465/587 and IMAP993 servers plus PostgreSQL16, When the actual production adapter and API/store paths execute positive, hostile, cancellation and revision races, Then all prior criteria have source-bound witnesses, including parent test title `live diagnostics enforce pinned TLS without DATA`. A mocked connect success alone cannot pass. Additive schema12→13 preserves encrypted data/state and produces no verified diagnostic/lease/consent backfill. Existing unit/PG/security/dispatch/billing/capacity suites, typecheck/lint/build and relevant Docker browser pass; mutations disabling hostname enforcement, receive cap or revision predicate fail their actual guards. F07 global30/lease120/null mailbox plans, campaign3/10, TEST100minorRUB/30days, post-lock UTC quota and unknown_delivery no-blind-retry remain regressions. F08 does not claim F09–F15 or whole expanded acceptance.
