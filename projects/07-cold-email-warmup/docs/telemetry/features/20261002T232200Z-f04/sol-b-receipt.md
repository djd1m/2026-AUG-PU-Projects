# F04-B public stop and local polling receipt

Run-ID: 20261002T232200Z-f04
Work-Unit-ID: n7-f04b-sol
Attempt-ID: implement-b1
Source-Revision: c6cbbbfe8250ca37833d397ab1c8aced9e604789 (caller launch baseline; F04a accepted)
Product-Revision: ff9692093aa21b32aa40809c2d9bf9ca4746e1cc
Build-Revision: ff9692093aa21b32aa40809c2d9bf9ca4746e1cc
Launch-SHA256: 369bdcf47544d5edc2b875d1a3c88bb2e8300fdbb4a4815177fe4e51b20c0915
Spec-SHA256: 6deaa2f48d531ca66b71abb9f1b90794836cc4ab80eab557076863b92de74a38
Started-At: 2026-10-03T00:15:01.771530+00:00
Finished-At: 2026-10-03T00:35:11.202776+00:00
Deadline: 2026-10-03T00:40:01.771530+00:00
Verdict: implementation and mandatory runtime gates PASS; fresh independent B review remains parent acceptance gate
Profile: compact-quality-first-v2
Requested-Model: gpt-6.1-sol high
Actual-Model: null (attributable host metadata pending)
Actual-Effort: null (host metadata pending)
Usage/Cost: null (host usage/cost unavailable; no inferred counters)
Fallback: no model switch or agents attempted; immutable dependency donor fallback recorded below
Elapsed-Wall-Ms: 1209431
Active-Wall-Ms: null (complete attributable wait partition unavailable)
Trace-Path: /tmp/n7-f04b-sol/projects/07-cold-email-warmup/docs/telemetry/features/20261002T232200Z-f04/sol-b-receipt.md

## Implemented result

Public GET validates existing hashed opaque32byte dedicated F03 capabilities and returns accessible generic confirmation, no business mutations/PII. POST accepts only one bounded RFC one-click or HTML confirmation form field and derives all scope from the capability/job. Origin absence is allowed solely for capability POST and the distinct operator API without cookies; other unsafe APIs retain Origin validation. Shared durable30/min socket-IP bucket is charged before token/auth/Origin failure;31st returns429/Retry-After and forwarded headers cannot bypass it. No request URLs/tokens/raw auth headers/native errors are logged.

POST owns shared advisory lock(7,1) FIRST, samples current post-lock time, validates expiry and job/mailbox/enrollment/digest bindings, then suppresses/cancels atomically. Pool capability globally revokes consent/membership of immutable job.recipient_mailbox_id, cancels queued/claimed incoming/outgoing pool work, preserves sender/recipient operational state and submitting boundary. Existing F03 final predicates block withdrawn peers. Shared client-level suppression/complaint/withdrawal helpers avoid nested transactions and preserve original public seams.

Complaint HTTP API requires separate runtime OPERATOR_TOKEN_FILE >=32 decoded random bytes, distinct from existing keys, constant-time SHA256 hash comparison, absent config closed. Ordinary cookie users have no authority. Validated explicit event/tenant/mailbox/recipient digest or address yields durable payload-bound dedup plus recipient suppression/sender quarantine/pending cancellation in one transaction. Foreign/malformed/auth failures have zero business writes and generic errors. Single configured operator authority uses global event IDs; unsigned generic provider webhooks remain absent.

Additive008 stores independently durable local fixtures with UIDVALIDITY/UIDNEXT/header rows/failure/due-time. Operator CLI alone seeds/updates/polls/retries; no tenant HTTP force-fresh route. Explicit local_test reader provides <=100 ordered headers and actual sparse/expunged range coverage, with101 lookahead preserving honest tail boundary. ReplyStore H/tailH and001–007 remain unchanged. Each source operation<=30s and attempt deadline<=120s; no eligibility lock over IO. Default disabled; local empty source can complete only after explicit durable seed. Incomplete requires explicit retry; restart loads durable run/H/tailH/cursor; failures/reset remain paused. Consent/quarantine are preserved. Tenant read status returns mode/scan/cursor/lastComplete/provenance without headers/credentials. Optional compose local-poll profile has no additional host port; bounded operator worker loops on30s cadence, one due mailbox per tick.

## Six AC and evidence

| AC | Concrete evidence | Result |
|---|---|---|
| AC-B1 | Generic accessible GET0 business writes; malformed/forged/session/expired GET+POST400; exact30day boundary; corrupted job binding400; HTML and RFC POST; no login/PII/client scope | PASS |
| AC-B2 | 12 concurrent idempotent POSTs; actual post-lock expiry; pool intended recipient global withdrawal preserves sender/state/submitted; future pairing0; production unsubscribe beforefinal0/afterfinal1/later0 | PASS |
| AC-B3 | Real HTTP operator401/foreign400/malformed400 zero business writes; ordinary user/cookie rejection; absent auth config closed; same event replay stable across new store; conflicting payload400; atomic suppression/quarantine/cancellation; complaint production races both orders | PASS |
| AC-B4 | 31 concurrent public failures:30×400+1×429;31 unauth complaints:30×401+1×429; Retry-After; varied X-Forwarded-For does not bypass; headers no-store/no-referrer; zero-write snapshots; public capability mutation red/restoredgreen | PASS |
| AC-B5 | Actual operator CLI durable seed and poll; default/missing/failure pause; explicit empty completion; validity reset;2001-header budget incomplete, restart same run/H/cursor, explicit CLI retry completes; sourceadapter101-tail prefix stays paused; stale run rejects; status tenant boundary; timeout/header-body guards | PASS |
| AC-B6 | Actual seed→operatorpoll→ReplyStore→pending job cancelled realPG; full prior F01/F02/F03/F04a regressions and all3kind renderer retained; HTTP stop/complaint realPG; exact source/build/image and canary checks | PASS implementation; parent fresh B review pending |

## Checks and exits

`bash scripts/check-f04b-heavy.sh`: exit0. Typecheck, lint, host build and Node22 image build each exit0. Full unit18/18; full PostgreSQL80/80, no skipped or failed tests. Real HTTP server/native PG, not mock acceptance. Own stack n7f04b, runtime /tmp/n7-f04b-runtime, loopback18706 only; DB no host ports. Port/RAM/disk preflight exit0. Global flock acquired00:29:37, released00:32:13 UTC; CPU2. Candidate frozen00:27:38 UTC, before minute18; no product correction required after freeze. Full logs: sol-b-heavy.txt.

`python3 scripts/check-f04b-mutation.py`: harness exit0; mutant test exit1 expected (11 pass/3 fail). Removed forged-capability rejection so unknown-token GET incorrectly confirmed; production HTTP/expiry assertions detected it. Source/runtime restored in finally, SHA verified. Affected restored PG14/14 exit0; no unchanged full green suite repeated. Evidence: sol-b-mutation.txt and sol-b-restored-source.txt.

`python3 scripts/check-f04b-secrets.py`: exit0, checks own tracked/untracked project files, isolated stack logs and durable reply data against actual runtime secret values and credential/header-display/body canaries; values suppressed. `python3 scripts/check-f04b-snapshot.py`: exit0, all host source/test/db/package/type hashes match restored runtime inputs, compiled JS matches Node22 image build, container uses built image. Shell/Python syntax and diff checks exit0. Dependency versions unchanged; requested F04a node_modules absent, parent-approved F03b immutable donor reused after identical lock hash, never modified/pruned. Direct/transitive provenance remains existing inventory; no new dependency.

Source-SHA256: 73e4dce149f6674937995b72d2f7dca516674ecd7e7814254832ad7cd28255e1
Build-SHA256: 5695138755f8e978d249c9059e3d60e9c1d5d39041cfb10fb60935aa5822dc14
Image-ID: sha256:aa1ce9e037d73d9ca1032d3d0f665e9cd7f7396e4cd026aa5ac26df40a59eded
Container-Image-ID: sha256:aa1ce9e037d73d9ca1032d3d0f665e9cd7f7396e4cd026aa5ac26df40a59eded
Dockerfile-SHA256: f8d6728ac4337c589cf55983654e2cf51ac437ef4711e20086f12d775cc997f5
Package-Lock-SHA256: 49b300c360c2c1471596b225ced88d8b509bb57fcc2787a83c0dd5190089eb1a

## Limits and handoff

Fresh different-model B review is explicitly owned by parent and still pending; entire F04/backend/MVP acceptance is not claimed. Browser cabinet fullUX remains F06. Live SMTP/IMAP/TLS provider operation, external mail, charge, paid LLM, deploy, push and shared proxy remain outside authority; fixture mode never labelled real IMAP. Optional persistent compose loop profile was not launched; operator process and production fixture poll path were exercised. No fake real-provider verification. Actual model/effort/token counters/cost await host evidence, active duration null; savings unestablished. Caller launch/manifest remain untracked/unstaged. Root/other project sources unchanged.

Status: completed
