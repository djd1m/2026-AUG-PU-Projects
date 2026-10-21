# F11 implementation pack — inbound context and retention

**Run:** `RUN20261006T090602Z-n7-expanded-mvp-a1`  
**Status:** planner draft for independent validation; no implementation or executed-check claim.  
**Frozen source:** `afb58dc9b26f814433b117a63e45994c71e7cbde` at `/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup`.  
**Routing:** `model-routing-econom`; requested CLI model `gpt-6.1-sol`, effort `high`; actual model, usage and cost `null` (`host_not_exposed`).

F11 coding starts only after **F10 acceptance and independent validation of this packet**. This attempt performed bounded reads and file-digest checks only.

## 1. Provenance and existing five-role canon

The provenance authority is [`context-manifest.json`](./context-manifest.json), SHA-256 `d72dcb3abfbd36a95b457edb14a2aaa51106f744cc6c068a3721bfeb5efd7546`; its recorded launch digest is `d8e28ca38f268d1508c1d889f1ee0aaa6505a4571698ee6331c1f6d8e37eb4e7`.

Selected local copies match their manifest SHA-256 values:

| Manifest `normative_files[].path` | Read copy | SHA-256 |
|---|---|---|
| `projects/07-cold-email-warmup/docs/decisions-owner.md` | `canonical/decisions-owner.md` | `cf47d55af1d5ad4cd5f34c7531f1d2004dfdc98076e7459c76af8b93f3e709d8` |
| `projects/07-cold-email-warmup/docs/plans/expanded-mvp-plan.md` | `canonical/expanded-mvp-plan.md` | `cb9449fb233471275dd6ee67a496d8d04f38ddedf637bdfe4588dfc9689fb13d` |
| `projects/07-cold-email-warmup/docs/features/expanded-mvp/01_specification.md` | `canonical/01_specification.md` | `dddb2cbdb5b3f7f54c7d63571ed7429b7abac1d42e6f8eb6ff8079dddc69979a` |
| `projects/07-cold-email-warmup/docs/features/expanded-mvp/ai-policy-v1.md` | `canonical/ai-policy-v1.md` | `d3d7c9d4614134f1dca9078ed797e3f8ee94a7bc613856bb54f2f2628b566512` |
| `AGENTS.md` | `canonical/AGENTS.md` | `ca1b4cc25738f7d9d58f37da640c741d79befa45e2209364474bea6d097181d8` |
| `CLAUDE.md` | `canonical/CLAUDE.md` | `c1669853c58eddd6994761d510f5f1a4d1b992b50e16f8ebedf18a10937144a2` |
| `projects/07-cold-email-warmup/CLAUDE.md` | `canonical/projects__07-cold-email-warmup__CLAUDE.md` | `3b548fa6dea02c7639aa7fbdfdc3fa1f7bbf90b6726c406501d89cc2b3fe3ba0` |
| `docs/development/model-routing-econom.md` | `canonical/docs__development__model-routing-econom.md` | `4622c96c879baa08d548f99b4f48ec19e7f59bb0eb91b2a58de46db4a079ee09` |

The first four entries record revision `dfb3219e58a86dbf0a16b68e4fb6f26def99a4da`; instructions record `currentmain4053db4c`. Manifest `copy` fields name the earlier `a1b-cli` directory; reads used the supplied `./canonical` copies without rewriting provenance.

Reuse all five approved roles, with this packet providing only F11 deltas:

1. [Specification](../n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup/docs/features/expanded-mvp/01_specification.md): FR/AC-expanded-mvp-005, SC-US-105-1.
2. [Pseudocode](../n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup/docs/features/expanded-mvp/02_pseudocode.md): stop-first capture, encrypted minimal context, expiry.
3. [Architecture](../n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup/docs/features/expanded-mvp/03_architecture.md): existing PostgreSQL, native transport, tenant predicates and AEAD.
4. [Refinement](../n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup/docs/features/expanded-mvp/04_refinement.md): independent literal bounds and hostile-input checks.
5. [Completion](../n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup/docs/features/expanded-mvp/05_completion.md): planned parent witness `tests/expanded-mvp-05.test.ts`, title **“inbound context is bounded tenant scoped and expires”**.

These source-role supplements were read at the frozen source. Their digests, respectively for roles 2–5, are `1deb0b3d98038350f2284e9af0313df8d3792c0b0b1c8be869b8da750b5a1752`, `307b5f5fc82e483f3d880b108c6abac25c44ba43e01ec6eaa001864179850dfe`, `ca4f3cb774b0a3cad91cb4e3cbab21f0e951c9fc9e9fd52b2308794c441fa8de`, `5bb05f10bbcc155b96d0f0d0b8594305fb1ee1cebfdf1fef1aac28e1303da6f2`.

## 2. Slice boundary and preserved contracts

Implement bounded inbound capture, deterministic safety classification, encrypted storage and deletion. F12 owns OpenAI/provider access, draft storage/API/UI and final policy admission; F13 owns reply-purpose dispatch authority; F14 owns SLO reporting.

Preserve:

- `eligibilityTransaction`: `BEGIN`, then **global FIRST `pg_advisory_xact_lock(7,1)`**, before eligibility writers and final fences; no network inside transactions.
- Complete header-poll freshness **<60 seconds**, explicit incomplete-rescan retry, UIDVALIDITY/run/attempt/source/grant/mailbox guards.
- Shared UTC quotas, provider lower limits winning, and `unknown_delivery` without blind SMTP retry.
- Physical **2 SMTP / 4 IMAP global / 1 per mailbox per protocol**, with exact child-exit closure before slot release.
- Campaigns remain stopped; capture grants never authorize generation, content disclosure or sending.

## 3. Stop-first ownership and capture authority

Frozen `ReplyStore.ingest` matches references against own `send_job` rows in `submitting`, `submitted` or `unknown`, then compares the decrypted enrollment recipient with the incoming sender. Preserve that rule.

Within the existing page transaction, retain all semantic stop effects and atomically insert a capture intent **after those effects**. Network capture starts only after commit. Crash/replay cannot leave a captured body without its committed stop.

A context binding requires exactly one matched enrollment and one unambiguous referenced root job. Ambiguous references still stop every legitimately matched enrollment, but context becomes `held`. Unmatched/foreign input receives no body fetch. Message-ID alone never establishes ownership or deduplication.

Bind each intent to tenant, mailbox, enrollment, root job, physical `(UIDVALIDITY, UID)`, header identity, originating run/attempt and source. A later poll run is allowed only through a fresh capture claim and current mailbox/source/UIDVALIDITY checks; an old claim cannot commit into a new owner’s work.

**Proposed contract requiring independent validation:** introduce separate capability `imap_body` through the existing operator transport-grant mechanism. Existing `imap_headers` grants remain header-only. No automatic grant upgrade or grant publication occurs.

`imap_body` authorizes narrowly scoped read-only capture of an already owned intent, including bounded MIME/classification metadata. It binds existing endpoint/config fingerprint, mailbox transport revision, expiry and tenant/mailbox. Require current header authority as well. Default is closed; missing, expired or revoked body authority produces an explicit hold.

Local body capture and later OpenAI content disclosure are **separate gates**. No external-provider authority is inferred here.

## 4. Exact additive migration contract

Add `db/016-inbound-context.sql`; register version 16 in `src/db.ts` migration and readiness checks.

Create **`incoming_ai_event`**, mapping the existing logical IncomingAIEvent:

- UUID `id`; `tenant_id`, `mailbox_id`; nullable `enrollment_id`, `root_job_id`.
- `uidvalidity text`, `uid bigint`, `origin_run_id uuid`, `origin_attempt integer`, `source`, `binding_version integer`.
- `state`: canonical event enum `pending/held/drafted/approved/queued/submitted/error/unknown`.
- Separate `capture_state`: `pending/claimed/ready/held/purged`.
- `reason`, `observed_at`, `created_at`, `captured_at`, nullable `terminal_at`; `expires_at`, `metadata_expires_at`.
- Nullable `content_envelope jsonb`; `message_bytes integer[]`, `body_bytes integer`, `thread_message_count integer`.
- Nullable `intent_candidate`, `rules_version`, `rules_hash`; no F11-created send approval or final eligibility verdict.
- Capture `owner_id uuid`, `generation bigint`, `lease_until`, `next_attempt_at`.

Enforce unique `(mailbox_id,uidvalidity,uid)` and `(tenant_id,id)`. Add a unique observation key `(tenant_id,mailbox_id,uidvalidity,uid)` for a composite FK. Use composite ownership FKs to mailbox/enrollment; validate root-job ownership in the locked store transaction.

Checks: UID range; positive attempt/version; claimed-state owner/lease consistency; content allowed only with owned binding; count **1–5**, array cardinality=count, each length **0–32768**, total **≤65536**, and total equal to the five bounded array positions’ sum. Recompute lengths from plaintext before encryption and after decryption.

Initialize absolute expiry from event creation; terminal transitions can only shorten it. Index capture due work, content expiry and metadata expiry.

For runtime integration, extend existing `runtime_due.kind` and `runtime_tenant_turn.kind` constraints with `body`; reuse existing claim/generation machinery. Add no new queue or validator framework.

Migration is additive: **no deletion or rewrite of existing headers, jobs, receipts, stop effects, reservations or unknown-delivery audit**. Existing observations receive no bulk body backfill.

## 5. Bounded reader, store and classification APIs

Proposed internal interfaces:

| API | Contract |
|---|---|
| `enqueueCaptureClient(client,binding)` | Called inside the existing stop/page transaction; physical-event dedup; no I/O. |
| `claimCapture(tenant,mailbox,runtimeClaim)` | One pending event; current ownership, lease and authority snapshot. |
| `BodyAdapter.readOwned(binding,signal)` | Discriminated `text/hold/uidvalidity_changed`; authenticated child evidence, exact UID, bounded timestamps and grant revisions. |
| `parsePlainBody(metadata,bytes)` | Pure deterministic parser; returns bounded text or typed hold. |
| `classifyInbound(headers,text,rules)` | Finite versioned negative rules and supported intent candidates; never grants dispatch authority. |
| `commitCapture(claim,evidence)` | Recheck claim/source/UID/grants/binding, classify, encrypt, persist; no network. |
| `readContext(tenant,eventId)` | Own, unexpired, ready context only; verifies AEAD and constituent deadlines. |
| `markTerminalClient(client,eventId,outcome)` | Earliest terminal time wins; monotonically shorten expiry. |
| `purgeExpired(limit)` | Bounded idempotent deletion; returns metadata-only counts. |

Keep `ReplyAdapter.read` and its F09 header command unchanged. Add a separate child request for body capture. The current channel’s `literal` limit is 8192; add an explicit operation-bound literal limit whose default remains 8192.

Body operation: `EXAMINE INBOX`, verify UIDVALIDITY, then exact-UID `BODY.PEEK` metadata and text reads. Metadata includes identity, Content-Type, transfer encoding/disposition and automatic/loop indicators; cap at **8192 bytes**.

Proposed minimum MIME support: single-part `text/plain`, UTF-8 or US-ASCII, 7bit/8bit transfer encoding. Absent MIME fields follow deterministic text/plain/US-ASCII defaults. Multipart, HTML, attachments, message/rfc822, base64, quoted-printable, unknown charset, malformed/duplicate fields or invalid UTF-8 produce hold. No replacement-character decoding.

Request at most **32769 bytes** as an oversize sentinel; **32768 accepted, 32769 held**, never silently truncated. Reject excessive declared literals before body allocation; retain channel wire/buffer caps and exact closure.

Context contains the new body plus previously captured members with the same owned binding. Read at most six candidate members to detect overflow; **six messages or 65537 total bytes holds**. No remote thread search, attachments or URL downloads; each count is **0**.

Negative precedence: unsubscribe/complaint suppression through existing seams; bounce, OOO, bulk, automatic and own-loop hold; hostile authority/exfiltration/injection requests hold; then deterministic intent candidate. Unsupported, empty or ambiguous input holds. Rules must be finite, versioned and frozen before acceptance. F11 candidate intent does not establish F12 `eligible_at_arrival`.

## 6. Fairness, privacy and retention

Integrate one body lane into existing runtime claims. Header polls have priority; body admission leaves a physical IMAP slot available for polls and refuses a mailbox with due/incomplete header work. Each body quantum performs one bounded protocol stage, maximum five seconds, yielding between metadata and text. It never changes poll cursor or `completed_at`. Added capture must pass the existing A1 cadence/fairness witness; timing failure blocks acceptance.

Use existing `Keyring`/`Envelope` shape with dedicated AES-256-GCM helpers. AAD binds domain `n7-inbound-content-v1`, tenant, mailbox, event, binding version and key version. Preserve credential AAD unchanged. Capture evidence labels alone are insufficient: trust derives from authenticated child IPC plus current database fences.

No body, quoted context, subject excerpts or recipient plaintext in logs, exceptions or audit. No plaintext spool/cache. Release plaintext references after processing and clear owned buffers where practical.

**Capture completion is not a terminal outcome.** Ready content remains pending downstream. Terminal outcomes are final hold, cancellation/revocation, permanent failure, proven submission and unknown delivery with retry disabled. Transient capture failure remains pending until its deadline.

Use PostgreSQL time for persisted clocks:

- Content deadline: `min(created_at + 7 days, terminal_at + 24 hours)` where terminal exists.
- Copied context expires no later than its earliest constituent deadline.
- Replays, leases and draft versions never reset clocks.
- F11 audit metadata expires at `created_at + 30 days`, without body.

Purge ciphertext and dependent content at terminal **≤24h**, pending absolute **≤7d**. F12 must adopt the same deadline/terminal hook for every draft version before draft acceptance. Reads deny expired content even before cleanup. Cleanup runs during normal maintenance and before new capture on restart; outages must report overdue physical deletion honestly.

## 7. AC/BDD and mandatory evidence

All thresholds below must use literal test values independent of production constants.

| Witness | Given / When / Then | Meaningful checks |
|---|---|---|
| F11-STOP | Matched reply, replay and crashes around commit → stop precedes fetch; one intent; campaign remains stopped | Real PG transaction/race tests and protocol call ordering |
| F11-BOUND | 32768/32769-byte bodies; 5/6 messages; 65536/65537-byte context → exact accept/hold | Unit multibyte/encoding tests; fragmented local TLS literals; lying lengths and oversized declarations |
| F11-AUTH | Header-only, revoked/expired body grant, changed credentials/source/UID/run → closed hold, no unauthorized fetch/commit | Real PG races; local TLS command transcript; retained F09 header-only witness |
| F11-INTENT | Unsubscribe, bounce, OOO, bulk, loop, injection and ambiguous MIME → stop/suppression or hold before downstream work | Frozen rule fixtures; suppression races; draft/SMTP calls zero |
| F11-TENANT | Foreign tenant/root/UID, reused ID, ciphertext swap or unknown key → no foreign bytes | Real PG negative ownership tests; AEAD failures; DB/log/IPC canaries |
| F11-TTL | Terminal 24h, pending 7d, metadata 30d, replay/restart/concurrent purge → deletion and expiry denial | Real PG clock-controlled boundary tests; all content copies; purge idempotency |
| F11-RUNTIME | A1 header load plus body pressure/cancellation → poll freshness/fairness and physical caps survive | Existing F10 protocol witness extended with capture pressure; exact-child closure and shutdown |
| F11-MIGRATE | Populated v15 with stopped jobs/unknown receipts → migrate twice and restart | Real PG upgrade, fresh install, rollback-on-failure; existing audit bytes preserved |

The parent AC005 witness must exercise these contracts, not merely import constants. Required implementation gates remain suite/lint/build, existing traceability/scenario/criterion/review checks and affected F09/F10 regressions. None ran in this planning attempt.

## 8. Ownership, execution and unresolved decisions

One isolated coding writer owns migration/db registration, new `src/replies/{body,context-store,crypto}.ts`, and minimal changes to replies store/adapter/IMAP/worker, transport authority/child/channel/lifetime and runtime store/loop/worker. Tests: F11 unit/PG/protocol files, parent AC005 witness and narrowly extended existing fixtures. Coordinator owns integration and completion links; no dependency/lockfile change is planned.

First fresh `gpt-6.1-sol/medium` attempt: **≤20 minutes including a three-minute seal reserve**. Prioritize migration, stop-first intent, parser, AEAD, retention and meaningful PG evidence. Transport authority and runtime integration span a separate concrete file set; schedule a subsequent bounded attempt only if the first sealed artifact leaves those ACs unfinished. Record accepted revision, remaining ACs and next responsible executor; verify continuation actually starts.

Independent plan validator and implementation reviewer: fresh `gpt-6.1-sol/high`, **`fork_turns=none`**, reviewer budget ≤8 minutes. Supply this frozen packet, exact canonical provenance, frozen legitimate code/tests and check evidence. Exclude author chat, reasoning, working notes, receipts and operational handoff.

Decisions/gaps to close:

- Validate the proposed separate `imap_body` contract, strict MIME support and body-lane admission rules. No live authority exists by invention.
- Freeze finite RU/EN safety/intent rules; canonical documents provide intent families, not executable patterns.
- F12 draft deletion and F13 terminal notifications remain future integration obligations.
- Four manifest-listed rule/companion copies are absent from `./canonical`; they were not read. Reconcile applicable instruction context before validation.
- Accepted F10 revision may differ from this frozen source; compare only affected interfaces before coding.
- Backup/WAL content-erasure guarantees are unspecified; define them before any live retention claim.

External provider/OpenAI access, spend, installation and deployment require their separate gates. This packet authorizes none of them.