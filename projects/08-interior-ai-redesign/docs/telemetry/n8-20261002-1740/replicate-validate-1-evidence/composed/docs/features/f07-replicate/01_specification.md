# F07 — Replicate inference transition (PLAN, AUTO)

Source: `e2dded9898d8b00f2fa5613e5f5d3fb63281715b`. Date: 2026-10-03.
Status: proposed, not implemented or independently validated. Owner scope: `../../decisions-owner.md` (2026-10-03). External spend authorized now: **0 USD**.

## Product brief and boundaries

RoomKind users redesign their private room through the existing upload → style → queued job → private comparison flow. Replace the local inference execution boundary with server-side Replicate depth-conditioned predictions; keep PostgreSQL queue, admission, fences, ledger, account hold, private media and UI contracts. Explore skipped: approved brief is clear. No auth/payment redesign, scheduler, browser provider access, webhook receiver, deployment, paid pilot or canonical-document mutation in PLAN.

Target catalog: `docs/features/f07-replicate`. Roles: specification=`01_specification.md`; pseudocode=`02_pseudocode.md`; architecture=`03_architecture.md`; refinement=`04_refinement.md`; completion=`05_completion.md`.

US-001: As a room owner I want a private depth-conditioned redesign without duplicate credit use.
US-002: As an operator I want bounded remote effects, recoverable identities and honest quality evidence.
All requirements below are MVP software scope; real quality/performance acceptance is a separate, presently unauthorized pilot gate. Existing 41 AC remain mandatory and historical evidence is unchanged.

## Functional requirements

### FR-f07-replicate-1
Server selects explicit `replicate` mode and pinned depth-conditioned model contract; no automatic fallback. Existing fixture/controlnet remain explicit modes. Map four existing style enums to fixed server prompts; no user URL/model/version/prompt override. Candidate and verified schema in research; hosted capability is established, room-quality success is not.

### FR-f07-replicate-2
Persist preflight → submitting before any create request; persist provider prediction ID and status monotonically. At most one create invocation per submission. Once submitting is durable, crash, timeout, lost response or malformed success cannot cause automatic create replay. Local idempotency keys do not make Replicate idempotent.

### FR-f07-replicate-3
Preserve 60s application queue, 180s fixed attempt, 360s job, 30s lease/10s heartbeat, account→job fences and unique credit release. Provider starting/processing, polling, import and final DB commit all consume the same attempt deadline. Known remote work can be resumed under a new fence within its original deadline without another ticket/start. Uncertain remote work is terminal locally with operator reconciliation, not a second paid attempt.

### FR-f07-replicate-4
Transmit only bounded sanitized image bytes as server-created data URI; do not publish input URLs. Copy validated provider image/depth bytes to UUID private artifacts, bind original and transmitted input hashes and transforms; browser receives existing authorized app media paths only. Deletion fences immediately and schedules best-effort cancellation for known ID without delaying local revocation.

### FR-f07-replicate-5
Use explicit hosted provenance and unverified quality. Operator quality acceptance requires actual matching hosted corpus/bytes/report and retains openings=0 added/removed and anchor displacement≤0.02. Fixtures and mocked transport never establish hosted quality, latency or actual costs. No public acceptance from `succeeded` alone.

### FR-f07-replicate-6
Disable hosted submission unless operator configuration includes secret presence, immutable model/version contract, privacy/license acceptance and authorized spend envelope. Existing 200 platform/20 account per UTC day ticket maxima remain; remote uncertainty keeps conservative capacity and spend reservations. Provide safe reconciliation/disable/rollback instructions, without a new financial ledger or scheduler.

## Non-functional requirements

### NFR-f07-replicate-1
No provider credential, data URI, prediction input/output URL, raw provider error/log/body or private media in browser, application logs, Git or telemetry. Provider token only in worker server runtime; outbound API uses fixed HTTPS origin; model results use bounded allowlisted HTTPS with connection-bound public IP validation, no redirects, no auth header forwarding.

### NFR-f07-replicate-2
All network/decoding work outside SQL locks. API timeout≤5s per request and bounded retries for GET only, image import≤10MiB per artifact/20MP/single frame and fixed absolute attempt deadline. JSON response bound for this adapter is explicitly proposed as 512KiB (data-URI echo), not an implicit relaxation of payment64KiB. No network work extends a lease or hard deadline.

### NFR-f07-replicate-3
Old successful suites remain unmodified and green; PostgreSQL fault/race tests, meaningful guard mutation, fresh independent review and actual shared-Docker browser E2E after implementation are mandatory. Runtime quality, cost and warm status unknown are null/unknown, never guessed from model advertising.

## Acceptance criteria and named scenarios

### AC-f07-replicate-1
SC-US-001-1 — Given an owned valid room and configured mock transport, when a queued job runs through starting→processing→succeeded, then exactly one create, one consumed existing first ticket, one reserved credit, one immutable evidence record and private output/depth/config artifacts result; output is unverified and URLs never enter job JSON.

### AC-f07-replicate-2
SC-US-001-2 — Given missing token/version/privacy authorization/spend ceiling, invalid model/schema or production fixture, when startup/submission runs, then fail closed with safe code and **zero outbound creates**. Budget0 allows offline software tests only, never production create.

### AC-f07-replicate-3
SC-US-002-1 — Given create accepted remotely but response lost, malformed, oversized, or process killed between HTTP response and ID commit, when lease recovery and maintenance race, then create count stays1, submitting becomes ambiguous, local job fails/releases at most once and capacity/spend remain reserved. Crash before committing submitting permits later one create; crash after commit but before send is conservatively ambiguous.

### AC-f07-replicate-4
SC-US-002-2 — Given known prediction ID and expired lease, when two workers reclaim, then exactly one fence owns same attempt, original deadline/ticket/attempt number persist and only GET resumes. Late old-fence result cannot attach or delete winner artifacts; a late ID may be recorded for cleanup only.

### AC-f07-replicate-5
SC-US-002-3 — Given remote starting forever or intermittent 429/5xx/GET timeout, when DB time reaches literal attempt180s/job360s (or queue60s before start), then job is terminal/fenced, one release is made, cancellation is requested only for known IDs and never described as refunded provider cost. Heartbeats at10s cannot extend fixed deadlines; lease at30s is enforced. Cancellation/success race cannot revive failed job.

### AC-f07-replicate-6
SC-US-001-3 — Given hold commits before submitting, then zero new create; hold during an already authorized attempt allows existing canonical private completion, but denies retry/publication/badge-free export. Given deletion before/during create, GET or import, then tombstone/404 and single release apply, known remote ID is canceled best-effort, late ID goes to cleanup, and no stale result publishes. No claim that local deletion immediately erases provider data.

### AC-f07-replicate-7
SC-US-001-4 — Given hostile output URL variants (userinfo, non443 port, suffix spoof, IP literal, private IPv4/IPv6/DNS rebind, redirect), invalid content type/magic, compressed bomb, >10MiB stream, >20MP, animation, wrong dimensions or output count, when import runs, then no prohibited connection/publication occurs and only this attempt’s files are removed. Cross-account reads and deleted output remain404.

### AC-f07-replicate-8
SC-US-001-5 — Given 12 distinct licensed photos and three fixed styles, when evidence is synthetic, mixed mode/version/config, missing hashes, substituted depth/output, changed bytes or unmeasured report, then accept/publish is denied. Only independently measured hosted corpus with all36 pairs, no opening changes and anchors≤0.02 can qualify matching real results; fixture and old CUDA evidence remain separate.

### AC-f07-replicate-9
SC-US-002-4 — Given concurrent admission/retry/UTC rollover/exhaustion, when hosted attempts submit or become ambiguous, then existing atomic ticket accounting never exceeds configured≤200/20, does not decrement, and credit release is unique. Same remote attempt recovery consumes no second ticket; no hosted second create after a submitted attempt, including provider failed/canceled, in this initial conservative adapter.

### AC-f07-replicate-10
SC-US-002-5 — Given provider errors include token/data URI/URL and fake cost/warm fields, when transport fails or evidence is recorded, then logs contain only bounded safe codes/opaque IDs, unknown metrics stay null, operator records distinguish local credit release from provider billing, and startup/API/UI responses expose no credentials.

### AC-f07-replicate-11
SC-US-002-6 — Given implemented source, when completion is proposed, then all existing suites, new transport/PG races and source-bound mutation evidence are green, fresh review has no open blocker/high, and actual shared Docker browser follows companion preflight. Prior fixture browser receipts cannot substitute. Paid pilot and release stay pending while their authorization fields are empty.

## Success metrics

Software: zero duplicate creates under injected crashes (SOURCE: named transport/PG tests); zero unauthorized media responses (SOURCE: two-account/security tests). Geometry:36 measured pairs (SOURCE: licensed annotated corpus report). Performance:≥30 real jobs, queue/provider/end-to-end times and nearest-rank p95; existing warm≤25s acceptance remains pending unless warm/hardware are actually known or a later approved ADR revises that metric. Provider cost: actual billed evidence or null (SOURCE: operator billing export). All real measurements currently unknown.
