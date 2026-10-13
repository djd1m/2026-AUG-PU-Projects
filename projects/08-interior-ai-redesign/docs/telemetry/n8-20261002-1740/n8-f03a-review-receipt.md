**Verdict: REQUEST_CHANGES.** Independent F03a review completed. Two verification defects require correction; no production settlement defect was confirmed within this bounded review. Mandatory payment acceptance remains failed.

- RUN_ID: `n8-20261002-1740`
- WORK_UNIT_ID: `n8-f03a-review`
- ATTEMPT_ID: `n8-f03a-review-1`
- Source revision: `96e76172b08d63ef406d371b08f7b1e4b3af4f82`
- Reviewed delta: `2879672d..96e76172`
- Build revision: `787c84b893ccbfb0f70c20ffbd14f93314250360a5e563fe903de85de98734f2`
- Launch-SHA256: `2276571218b67cfc3b06a6dbe506a6f3725fb591cfe0d8e5543774bcf2c5288c`
- Finished-At: `2026-10-02T23:06:08.155372+00:00`

**Findings**

1. **P2 — HTTP acceptance scenario processes the wrong queued intent.**  
   [payments.integration.test.js:198](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-f03a-review/projects/08-interior-ai-redesign/tests/payments.integration.test.js:198), with helper at line 42.

   The successful HTTP POST at line 197 leaves an older intent in `created`. `intent(other)` creates another intent, calls `runOne()` once, then asserts that its own intent has a provider ID. The worker correctly processes the older intent and returns, leaving the newer one unbound.

   **Impact:** the mandatory suite fails before checking cross-owner HTTP access, return-URL effects, unknown notifications, and the webhook body limit.

   **Reproduction:** coordinator PostgreSQL execution confirmed `ERR_ASSERTION: assert.ok(p.provider_id)` at line 42, called from line 198. Fourteen scenarios passed; scenario 15 failed. See [runtime log](/tmp/n8-f03a-runtime/payments-pg.log).

   **Bounded fix:** process the intent created by the HTTP POST before calling `intent(other)`, or make the helper perform bounded worker passes until its specific intent is attached.

2. **P2 — The success→cancel test exercises duplicate-event handling instead of the required ordering.**  
   [payments.integration.test.js:117](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-f03a-review/projects/08-interior-ai-redesign/tests/payments.integration.test.js:117).

   The sequence is cancel→success→cancel for one payment. The first cancel claims its event key. The second cancel therefore returns at `payments.js:118`, before reaching the status-transition guard.

   **Impact:** the green scenario does not prove handling of a first cancellation notification received after success.

   **Reproduction:** an in-memory probe using the production notification source showed that removing the application’s cancellation guard survives this sequence; a fresh success→cancel sequence detects the mutation. This probe used a SQL double without schema triggers and is not a PostgreSQL mutation result.

   **Bounded fix:** use a separate intent for success→first-cancel; assert successful handling, unchanged `succeeded` status, and exactly one purchase grant.

**Coverage and source identity**

Reviewed PAY-01–05 and ATTR-03 against the plan, Specification, Pseudocode, and named scenarios: server pricing; immutable intent/provider requests; asynchronous creation, leases and 23-hour cutoff; bounded authenticated provider transport; verification before event claims; account→intent locking and deduplication; refund binding and permanent holds; queued release/start/retry interactions; and permanent first-payment attribution. Owner access, Origin handling, configuration, and fixture boundaries were included.

All **57 source-file hashes**, the canonical snapshot digest, launch digest, and **18 author evidence-log hashes** matched. The author’s baseline revision metadata was reconciled to the reviewed commit through matching snapshot contents. The immutable author receipt remains `Status: failed`.

F03b registry/cookies/aggregates, F04 exports/UI, production acceptance, and GPU validation remain outside this review.

**Checks and runtime gates**

Coordinator results from [runtime-results.json](/tmp/n8-f03a-runtime-results.json) identify the same source and snapshot:

| Check | Exit/result |
|---|---|
| Compose configuration, image build, `npm run build` | 0 |
| Node unit regression | 0 |
| Foundation, jobs, quality PostgreSQL suites | 0 |
| `node tests/payments.integration.test.js` | **1 — 14 scenarios pass, final scenario fails** |
| `node tests/payments.http.test.js` | 0 |
| Origin, owner, payment-binding, fixture, budget mutations | 0 |

The separate HTTP suite verified response caps, redirect refusal, malformed JSON, and slow-header/body timeouts.

Reviewer checks: snapshot/evidence verification and delta whitespace check exited **0**; both focused in-memory probes exited **0**. An initial direct-import probe exited **1** because this review worktree lacked `pg`; nothing was installed. Author evidence records 49 Node and five Python tests passing; unchanged green suites were not rerun by this reviewer.

Payment PostgreSQL log SHA256: `f6b997f675abf5e0eb61267a6bceb3e6f3e33f7ec7cc12f24efe6ca63d3a191c`.

**Telemetry and handoff**

Profile: `compact-quality-first-v2`; substantive risk: **XL**. Requested and host-banner-confirmed reviewer model: **gpt-6-astra, high**; no model fallback or delegation. Observation interval: `22:57:27Z–23:06:08.155372Z`; elapsed **521155 ms**, within 12 minutes. Active time, tokens, and cost: **null**, because authoritative measurements were unavailable. Savings are not established.

Coordinator installation destination:

`/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-f03a-review/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-f03a-review-receipt.md`

No product edits, installations, Docker execution, live provider calls, money movement, or deployment were performed by this reviewer. Correct the two test defects, rerun the affected payment suite, and obtain focused correction review before acceptance.

Status: completed