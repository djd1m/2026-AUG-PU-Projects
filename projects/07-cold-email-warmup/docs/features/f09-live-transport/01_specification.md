# F09 — bounded SMTP submission and IMAP header transport

PLAN / AUTO, 2026-10-06. Source: 801b1102972f76e67f17ce7f7dada7cc79de5ec7 (accepted F08).
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1; WORK_UNIT_ID: f09-plan-a1.
Route: /run mvp → /next F09 → /go → /feature. Coordinator route M/exit0 is a mechanical lower bound; XL applies to irreversible submission/security invariants. OWN-N7-005 already authorizes this local expanded scope. Independent VALIDATE, implementation and review remain pending. This is a delta to expanded-mvp AC003, not a replacement canon. Approved brief, research and solution inherited; Explore and broad donor research are unnecessary.

## User story and boundaries

As an authorized operator I need real protocol adapters behind existing dispatch/reply safety fences, so compatible mail servers can eventually be used without ambiguous retries or missed reply stops. Local real TLS fixtures establish implementation acceptance; no external accounts, sends, paid APIs or deployment are authorized by F09. F10 owns persistent fair workers, F11 body context, F12/F13 AI behavior and F14 arrival SLO; ai-policy-v1 and TEST billing remain unchanged. No UI changes planned.

Native Node22.20.0, existing dependencies only. SMTP465 implicit TLS or587 mandatory STARTTLS; IMAP993 implicit TLS, INBOX only. Advertised AUTH PLAIN / AUTH=PLAIN with password/app-password; OAuth, LOGIN fallback, PREAUTH, SMTPUTF8, 8BITMIME, PIPELINING, CHUNKING/BDAT, attachments, IMAP IDLE/QRESYNC/body context are unsupported. SMTP wire is seven-bit MIME (UTF-8 body base64, encoded subject); address local/domain syntax remains existing ASCII policy. IMAP accepts IMAP4rev1 or IMAP4rev2 capability token explicitly and a finite common command subset. See capability-contracts.md for checked primary evidence and restrictions.

### FR-f09-live-transport-001 — separate runtime authority

Production transport must require durable per-mailbox transport authority independent of diagnostics, consent and capacity. Process mode alone never authorizes external I/O.

### AC-f09-live-transport-001 — explicit grant and revocation

[SC-F09-001] Given only F08 success, credentials, allowlist or process live mode, When submit/poll runs, Then no decrypt/DNS/socket occurs without a current grant. Given a configured operator capability and a bounded privileged grant publication, When expected revision, tenant/mailbox, endpoint tuples, transport revision, scope, config fingerprint and expiry match, Then only that mailbox can use granted smtp_submit and/or imap_headers capabilities. Revoked/expired/wrong tenant/config/credential revision rejects; stale publication cannot undo newer revoke. Grant neither sets verified_test nor creates consent, active lease or jobs. Publication/revoke and every invalidation use global lock FIRST. Fixture connectors cannot be selected through HTTP or environment. Existing local_test mode remains explicit and labelled.

### FR-f09-live-transport-002 — retain final eligibility fence

Live submit must share the exact final claimed→submitting transaction with local submit, including current UTC quotas and both pool participants.

### AC-f09-live-transport-002 — linearization and quota safety

[SC-F09-002] Given a claimed job, When any stop writer, grant revoke, configuration replacement, expiry, capacity expiry or UTC rollover precedes final commit, Then transport is denied after current DB-clock checks. The FIRST statement after BEGIN is pg_advisory_xact_lock(7,1); all network I/O occurs outside transactions. Given commit wins first, Then at most that in-flight attempt may proceed; later stop cannot rewind it. Sender and pool recipient retain verified_test local readiness, active120s lease, current complete poll<60s and respective consent fences; verified_test is never claimed as external proof. Default10/day, ceiling30 and lower provider cap apply across all purposes, including future AI. Unknown/submitting retain reservation. Crash after commit before call is unknown, never silently queued.

### FR-f09-live-transport-003 — bounded compliant SMTP transaction

Submit one envelope and one seven-bit plain-text MIME message with stable persisted message identity, threading and unsubscribe metadata through a pinned TLS peer.

### AC-f09-live-transport-003 — actual SMTP acceptance

[SC-F09-003] Given real local465/587 fixtures advertising PLAIN, When production SMTP states run, Then AUTH follows verified TLS and post-STARTTLS EHLO, then MAIL FROM, one RCPT TO, DATA and exactly one terminated message. Accept greeting220, EHLO250, AUTH235 (at most one334), MAIL250, RCPT250/251 and DATA354; only complete final positive DATA completion250 establishes smtp_accepted. Malformed/unexpected success codes fail closed. Body UTF-8≤32KiB, subject≤200 Unicode characters, total serialized wire≤64KiB; MIME base64 lines≤76, encoded-word subject folding and CRLF/dot transparency are validated before commit. Header CR/LF/NUL injection and non-ASCII envelopes fail before network. Production messages have a valid configured sender domain Message-ID and no LOCAL TEST label; local sink keeps current explicit label. SMTP accepted does not mean delivered/inbox placement.

### FR-f09-live-transport-004 — phase-aware failures and recovery

Only proven failures before DATA bytes can retry; ambiguous or post-DATA outcomes never receive that proof.

### AC-f09-live-transport-004 — no blind retry

[SC-F09-004] Given timeout, disconnect, cancellation, crash or truncated reply once body transmission may have begun, When result/recovery persists, Then unknown_delivery retains quota and makes zero further submissions. Given a valid final4xx/5xx, Then persist definite rejection without automatic retry; do not mislabel no_data_submitted. Given pre-body4xx or proven pre-body transient network failure, Then at most3 attempts within120s with existing5s/30s delays; permanent TLS/auth/protocol/config errors do not retry. SMTP total90s, each pre-body phase≤10s and final-DATA wait≤30s inside total; these are application bounds shorter than RFC recommendations, never evidence of non-delivery. Parsed250 remains acceptance if later QUIT/close fails; failed outcome persistence/recovered submitting remains unknown. Accepted receipt persists attempt, message ID, mode and acceptedAt without adding a local_test_message row for live submission.

### FR-f09-live-transport-005 — bounded read-only UID coverage

Read headers using stable mailbox+UIDVALIDITY+UID identity and prove completed numeric UID ranges from tagged protocol completion.

### AC-f09-live-transport-005 — complete horizon proof

[SC-F09-005] Given IMAP4rev1 or IMAP4rev2 plus AUTH=PLAIN, When reader connects, Then use EXAMINE INBOX, require tagged OK/read-only and positive UIDVALIDITY/UIDNEXT; no SELECT/STORE/APPEND/body fetch. Read UID FETCH lo:hi (UID BODY.PEEK[HEADER.FIELDS (FROM MESSAGE-ID IN-REPLY-TO REFERENCES)]) with lo=cursor+1, hi=min(horizon,cursor+100), never '*', reversed ranges or sequence identity. At most100 headers; gaps/expunges and zero responses complete that numeric range only after exact tagged OK. A zero-width tail uses a fresh successful EXAMINE snapshot as proof, without invalid FETCH. Missing UID, duplicates, out-of-range IDs, missing requested header literal/NIL, unexpected tags, truncated literal, NO/BAD/BYE or changed UIDVALIDITY cannot advance cursor or freshness. Sequence numbers in FETCH are framing only. Fresh connections EXAMINE and verify generation before each range; EOF is never completion.

### FR-f09-live-transport-006 — atomic reset and replay semantics

Carry protocol evidence through the existing rescan/page transaction with a production source fence instead of local fixture generation.

### AC-f09-live-transport-006 — reset crash and replay

[SC-F09-006] Given a UIDVALIDITY reset or unfinished scan, When bounded polling runs, Then sending stays paused until full captured horizon plus a fresh fixed tail horizon completes. Page observations, semantic reply stops and cursor commit atomically; crash before commit changes none, after commit persists all; replay/UID reset/reused Message-ID does not duplicate a semantic mailbox+enrollment reply effect. Match sender and sent References/In-Reply-To in tenant context as existing ReplyStore does. A newer poll owner, transport grant/config revision or mailbox stop rejects stale capture/page completion. Existing20page/120s attempt and30s operation limits remain; exhausted/incomplete run resumes only via explicit bounded retry lifecycle, never manufactures freshness. IMAP INTERNALDATE and Date are not trusted arrival timestamps; F09 records local observed/complete times only.

### FR-f09-live-transport-007 — finite parser and socket ownership

Bound protocol memory, lifetime, concurrent admission and release resources on every exit.

### AC-f09-live-transport-007 — hostile framing and cancellation

[SC-F09-007] Given fragmented/coalesced literals, huge lengths, slow trickles or stalled writes, When parser reaches bounds, Then abort socket and reject page without partial effects. IMAP literal≤8192bytes/header, control line≤8192bytes, ≤1MiB total decrypted bytes per operation, ≤100 headers; byte counts checked before allocation/decoding and literal payload never parsed as tagged completion. Parse only requested fields, unfold continuation lines, reject NUL/malformed duplicates/ambiguous From or >50 combined references rather than truncate. Each operation≤30s, phase≤10s; SMTP response≤64KiB total/8KiB line. Writable false waits for drain under remaining deadline; inbound queue pause/resume is bounded. Global admission≤2 SMTP/≤4 IMAP, ≤1 per protocol/mailbox, enforced across processes with bounded durable operation leases; excess has zero sockets/no queue. Every timeout/abort/success releases timers/listeners/sockets and lease; stale callbacks cannot publish. Numeric public IP pin, original hostname/SNI and TLS≥1.2 remain required; unsafe/mixed DNS rejected before connect.

### FR-f09-live-transport-008 — preserve isolation and secret boundaries

AEAD and typed projections separate protocol secrets, local test artifacts and production observations.

### AC-f09-live-transport-008 — credential and evidence isolation

[SC-F09-008] Given wrong AAD/key/tampered envelope or credential/server-response canaries, When transport runs, Then decrypt failure opens zero sockets and plaintext/base64 secrets never enter API, logs, receipts or metadata tables. Persist enum-only reasons and opaque IDs, never server text/auth transcript or raw headers/body from IMAP. Production constructors have no fixture CA/dial/resolver selector in loadConfig/HTTP/main; test construction injects trusted local fixtures explicitly. Protocol fixture receipts remain protocol_fixture, local sink remains local_test, authorized external receipts alone may be live_provider. No new public route, UI, LLM operation or billing change.

### FR-f09-live-transport-009 — source-bound local acceptance

Require independent validation/review and real protocol/database fault witnesses before F09 is accepted.

### AC-f09-live-transport-009 — parent acceptance and regressions

[SC-F09-009] Given exact candidate/spec/build and Node22.20.0, When full acceptance executes, Then real local TLS SMTP/IMAP plus PostgreSQL prove the literal parent test tests/expanded-mvp-03.test.ts title `ambiguous SMTP and UID reset preserve recovery safety`, all eight preceding criteria, migration compatibility and existing safety regressions. Unit, real-PG concurrency/crash, local TLS, secret canaries, safety mutations, typecheck, lint and build must pass; browser is not_applicable unless implementation changes UI. No mocks-only protocol pass, no live pilot claim, no fabricated Phase III coverage during PLAN.
