# F04 — ответы, восстановление и прекращение сообщений

Canonical: Specification FR-n7-006/007, safety-v1; Pseudocode Ingest replies / Opt-out and complaint; security-scenarios SC-US-006-1..5,007-1..5. Source baseline2ff44de2. Owner OWN-N7-002 approves full autonomous plan/team; no repeated checkpoint. Real SMTP/IMAP activation, paid tests, charge/deploy excluded. Complete local-test protocol pipeline required; do not claim real provider access.

Substantive ROUTE XL: safety-bearing stop invariant, replay/cursor atomicity, public capability boundary. Mechanical explicit-path router M exit0 is only lower bound (new files not yet present). Full /feature PLAN→VALIDATE→IMPLEMENT→REVIEW retained. /next selected first dependency-ready F04 after F03 acceptance; /go F04 uses canonical validated SPARC plus this bounded delta. Compact-quality-first-v2: Astra planner/fresh reviewer, Sol6.1 high code/tests. Maximum one active worker in this lane; each writer isolated.

## F04a — durable reply ingestion / rescan (six AC)

### AC-f04-reply-suppression-001

AC-A1: validate bounded header-only pages <=100, UIDs/UIDVALIDITY and normalized single sender/References/In-Reply-To. Match only OUR sent message within tenant+mailbox AND decrypted enrollment recipient exact normalized sender; no subject match. Missing/malformed incoming Message-ID may still create effect if references/sender match; wrong sender, foreign mailbox/tenant, unrelated ref stop0. Header size/array limits explicit; no body retained.

### AC-f04-reply-suppression-002

AC-A2: all page writes use shared advisory lock(7,1) FIRST. Observation unique(mailbox,validity,UID), additional valid normalized Message-ID ledger; authoritative ReplyEffect unique(mailbox,enrollment,reply), immutable once-only counter/event. Effect, enrollment replied, queued/claimed cancellation, observations and page cursor COMMIT atomically; submitting remains in flight. Factor client-level shared stop helper if needed, never nested lock transaction. Same/new/missing/malformed message-id/UIDVALIDITY replays do not double count. Concurrent page attempts cannot skip/reorder coverage or resurrect stopped state.

### AC-f04-reply-suppression-003

AC-A3: initial poll or UIDVALIDITY change creates durable run_id with captured UIDNEXT-1 high-water H, cursor0, state scanning and mailbox_poll scan_complete=false. Keep mailbox operational state (quarantine/revocation) intact; pause via poll evidence. Page range coverage supplied by trusted protocol reader accounts for sparse/expunged UIDs; validate strictly increasing coverage, all headerUIDs in range, same run/validity/current cursor. Second reset creates new paused run; stale workers cannot advance/finish old run. No fresh timestamp merely from page progress.

### AC-f04-reply-suppression-004

AC-A4: per-attempt max20 pages×100 headers and120s elapsed; future clock failsclosed. Persist attempt count/start plus run/H/cursor. Budget exhaustion without completed coverage yields rescan_incomplete, stays paused until explicit bounded operator retry; retry retains run/H/cursor and resets only attempt budget. Crash restart resumes committed cursor same run/H. Only all coverage throughH AND successful bounded tail poll under unchanged validity atomically set scan_complete=true,last_complete_poll=current post-lock clock. Failed/partial/future/stale evidence never authorizes dispatch.

### AC-f04-reply-suppression-005

AC-A5: realPG crash BEFORE page COMMIT rollback observation/effect/cursor, AFTER COMMIT retained; old replyR effect1 and unseenS0→1 after replay with sameH. Deterministic actual lock races reply before final=>0 adaptercalls, afterfinal=>max1inflight/later0 using production ingestion writer. Verify concurrent duplicate page/effect, validity reset during old page/tail, sparse/empty pages, exact20pages and120s boundaries. F03 final freshness guards remain unchanged and prove paused sends0.

### AC-f04-reply-suppression-006

AC-A6: additive migration only (006), type/lint/build, fullunit/realPGregression, meaningful dedup or page-atomicity mutation red/restoredgreen, secret/header/body canary checks and source/image hashes. Fresh independent Astra review and unique terminal receipt. Store/interfaces documented for B. No public ingestion endpoint, fabricated freshness or live IMAP connection; A exposes trusted internal store only, B provides local durable source/worker.

## F04b — public stop consumers and operator polling (six AC)

### AC-f04-reply-suppression-007

AC-B1: existing opaque32byte hashed unsubscribe capability, purpose implicit dedicated table, bound expiry30days/job/mailbox/enrollment/digest. GET validates and shows accessible confirmation with zero business mutations; POST HTML confirmation or RFC one-click form performs idempotent generic success with no login/PII disclosure. Forged/expired/wrong-purpose reject400; no tenant/address selected from client payload. Rate-limiter security counters are the only GET writes, explicitly not business-state changes.

### AC-f04-reply-suppression-008

AC-B2: POST takes same lock FIRST, validates capability at current post-lock time and atomically UPSERTs tenant suppression/cancels recipient pending enrollments; repeated/concurrent requests idempotent. Pool token additionally withdraws intended recipient mailbox globally from pool through existing consent/membership writer under SAME transaction, not sender quarantine; token binds recipient via immutable job. Thus pool unsubscribe actually stops future peer sends and campaign unsubscribe applies tenant-wide. Preserve in-flight boundary. All future jobs consult effective suppression/membership.

### AC-f04-reply-suppression-009

AC-B3: operator-only authenticated complaint intake, no generic unsigned provider webhook. Durable event dedup bound to operator,event,tenant,mailbox and recipient; same transaction suppression +sender quarantine+cancellation. Unauthenticated401, forged/foreign/malformed0businesswrites. Operator auth is separate process-configured secret or explicit trusted internal CLI, never ordinary user authority. If HTTP API used, constant-time verification and Origin as applicable; no credentials in logs.

### AC-f04-reply-suppression-010

AC-B4: public token/complaint requests atomic30/min per socket/trusted configured IP (no arbitrary forwarded headers), invalid requests count; duplicate POST still stable; secure no-store/referrer policy/token-safe logging. Test31st429/Retry-After and concurrency, expired/wrong-purpose GET/POST, crawlerGET0businesswrites, real stop races before/after final and pool-global withdrawal.

### AC-f04-reply-suppression-011

AC-B5: bounded poll worker every30s with disabled default or explicit local_test fixture protocol adapter; reads only headers, <=100/page, operation<=30s, same durable A run/coverage/tail contracts, no DBlock over adapter IO. Local source independently durable and operator-controlled, can deliver real fixture headers/failures/validity reset; no public force-fresh endpoint. Resume incomplete requires explicit operator retry. Expose tenant-scoped status cursor/completion/rescan mode and local-test provenance, unknown real verification. RealTLS/allowlist adapter contract reused from F02; live network remains gated off under current authority.

### AC-f04-reply-suppression-012

AC-B6: end-to-end local operator seed/poll→actual persisted reply→pending stop and local unsubscribe/complaint HTTP flows with realPG; fullregression, relevant negative guards/mutation, sourcebuild/receipts/freshAstra. Preserve renderer body+oneclick headers all3kinds. Cabinet browser remains F06, not faked. EntireF04 done only A+B6/6.
