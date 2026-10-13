**Verdict: REQUEST_CHANGES.** Code-review verdict: **REQUEST_CHANGES**. Runtime verdict: **INCONCLUSIVE**; required PostgreSQL and Compose acceptance evidence remains unavailable.

- RUN_ID: `n8-20261002-1740`
- WORK_UNIT_ID: `n8-f02a-review`
- ATTEMPT_ID: `n8-f02a-review-attempt-1`
- Source-Revision: `4a59fb1c3bd79b634486252487a8b5b8c036eb36`
- Reviewed delta: `67d2e251..4a59fb1c`
- Build-Revision: `4ac13c0d0b854f2cb5423bd1eede26dd595dac265524c97bcdab104a5cc2c75a` — source snapshot, not a container image.
- Launch-SHA256: `c1ddc6b9457834587f4ab19b2268760c891bd1b6c2cae129280e740244bd4e79`
- Finished-At: `2026-10-02T21:06:25Z` — final verification observation.

**Findings**

1. **HIGH — PostgreSQL test reset retains budget counters, invalidating subsequent scenarios and the mutation baseline.**  
   Location: `projects/08-interior-ai-redesign/tests/jobs.integration.test.js:31`; supporting schema: `db/002-generation.sql:32`.

   `reset()` executes only `TRUNCATE account CASCADE`. `attempt_budget` has no foreign key to `account`, so neither platform nor account budget rows are cleared. Every scenario resets its clock to the same date, reusing the retained platform bucket.

   **Reproduction:** Run the authored PostgreSQL suite from a fresh schema. The first scenario leaves aggregate budget count `2`. The second successful admission adds another `2`, so its assertion at line 64 expects `2` but receives `4`. The following platform-limit scenario starts with an already exhausted platform bucket and admits zero requests instead of one. Consequently, the budget mutation cannot obtain its required green baseline.

   **Bounded fix:** Explicitly truncate `attempt_budget` within the isolated test schema during reset, alongside account-dependent state. Then run the complete PostgreSQL suite and the real budget mutation. This finding follows directly from the schema and test sequence; I did not execute PostgreSQL.

2. **MEDIUM — The injected clock is not restricted to `runtime: 'test'`.**  
   Location: `projects/08-interior-ai-redesign/web/jobs.js:34`.

   The constructor rejects `trustedClock` only in production. Development and unspecified runtimes accept it, contrary to the brief’s explicit test-only restriction. That clock controls budget dates, leases and deadlines.

   **Reproduction:** A read-only constructor probe against the unchanged module accepted `trustedClock` for `test`, `development` and `undefined`; only `production` rejected it. No database calls occurred. The current HTTP application does not expose this injection, so this is an internal boundary defect, not a demonstrated remote exploit.

   **Bounded fix:** Reject a supplied clock unless `config.runtime === 'test'`; cover development, production and missing runtime with negative assertions.

3. **MEDIUM — Accepted model provenance can serialize without its required fields.**  
   Location: `projects/08-interior-ai-redesign/web/jobs.js:263`, with persistence at line 180.

   Validation checks properties on `model_revisions`, but persistence serializes the original value. An array carrying the required named properties passes validation, while `JSON.stringify()` discards those properties. The database accepts the resulting `[]`, and the immutable-row trigger then prevents repairing that incomplete evidence.

   **Reproduction:**
   ```js
   const output = fixtureOutput();
   output.evidence.model_revisions =
     Object.assign([], output.evidence.model_revisions);
   validateOutput(output, 'test'); // accepted
   JSON.stringify(output.evidence.model_revisions); // "[]"
   ```
   The read-only probe confirmed both results. Database attachment was not executed. This concerns the current internal completion contract; it does not require implementing F02b byte verification.

   **Bounded fix:** Validate and persist a canonical object containing the three required revision strings; reject arrays and unsupported shapes. Add a focused assertion that accepted provenance retains all required fields after serialization.

**Review coverage**

I inspected the F02a plan, applicable requirements, architecture and named scenarios; implementation evidence and immutable receipt; migration, queue operations, API integration, configuration, media cleanup, maintenance, Compose changes and authored tests.

Static inspection supports the principal transaction design: platform-day→account-day→account→job ordering, idempotent replay before hold/cap decisions, atomic reservation and ticket allocation, nonrefundable counters, first-ticket consumption, rollover replacement, retry limits, fixed deadlines, live-fence completion, unique release, deletion fencing and the active pre-hold completion exception.

Owner-scoped gallery queries, maximum-50 pagination, private/no-store headers, absent public worker endpoints, separate output references and Compose CPU caps totaling `2` are present. These observations are not runtime acceptance. The authored suite also lacks the separate no-reserve release case explicitly named in the JOB-04 scenario; full scenario coverage must not be claimed.

**Checks and evidence**

| Check performed during this review | Result |
|---|---|
| HEAD and working-tree inspection | Expected source; only the supplied review-launch file was untracked |
| Python verification of all snapshot files | Exit 0; **32/32 hashes match** |
| Declared canonical `{files:[...]}` digest | Matches Build-Revision exactly |
| Product bytes at runtime revision `91fb4869` | **32/32 match** the reviewed snapshot |
| Launch-file SHA-256 verification | Matches supplied launch digest |
| Product-scoped `git diff --check 67d2e251..HEAD` | Exit 0 |
| `.dockerignore` baseline comparison | Exit 0; unchanged |
| Full-delta `git diff --check` | Exit 2; only Markdown hard-break whitespace in the immutable implementation receipt; no correction requested |
| Direct Node import probe | Exit 1: review checkout lacks `pg`; no installation attempted |
| Read-only Node VM probe with database dependency stubbed | Exit 0; confirmed findings 2 and 3; **not PostgreSQL evidence** |
| `/tmp/n8-f02a-runtime-results.json` | Absent at final observation |

The implementation records report syntax/build checks, four lightweight test files and the Origin mutation passing. I inspected those records and did not rerun the unchanged green sets. Their retained initial failures remain historical evidence.

Not executed here: PostgreSQL suites, owner/budget runtime mutations, build, Docker/Compose startup, migration execution, network/resource checks or maintenance recovery. The coordinator’s canceled lock-wait attempt is not a product failure. Required runtime acceptance remains pending.

F02b inference, actual-byte verification, quality operations, GPU geometry/performance, payments, sharing and full browser generation flows remain outside this review. Synthetic fixtures establish none of their acceptance gates.

**Execution and handoff**

Profile: `compact-quality-first-v2`; substantive risk tier XL retained. Host banner confirms reviewer `gpt-6-astra`, high; implementation host metadata records `gpt-6.1-sol`, high. No delegation, model switch or fallback occurred. Token usage, cost and active-time accounting are `null`; unavailable measurements were not estimated.

Measured elapsed from launcher start `21:02:06Z` through final verification: **4m19s**, within the 12-minute bound. No files were modified, services started, dependencies installed, secrets inspected or network/spend actions performed.

This response is the substantive receipt payload for the launcher to install at:

`/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-f02a-review/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-f02a-review-receipt.md`

Status: completed