# I4a F1 correction

Source: `38d870e6bb4089d92f1fa6c84e7893a326bf2cab`. Finding: `i4a-review.md:17–37`, F1 HIGH. Run `n8-20261002-1740`; work unit `n8-replicate-i4a-f1`; attempt `replicate-i4a-f1-1`.

Only `web/jobs.js`, `web/provider-submissions.js`, and `tests/replicate-lifecycle.integration.test.js` changed in product/test scope. Shared `isCleanupOnly` treats needed/claimed/done/unresolved as cleanup-only (every non-none marker). Under account → job → submission locks, hosted eligibility rejects these rows using the existing `submission_binding_mismatch` failure reason. Claim/maintenance candidate reads include cleanup markers even for a live lease. Existing terminal handling fails/fences the job and releases its reserved customer credit once; cleanup preserves an already durable marker. Identity, original submission fence/binding, ticket, fixed deadlines, counters and provider spend remain unchanged. Worker context independently rejects cleanup-only before lease checks/envelope access. I1 authorize/bind logic, DB007 and I2/I3 are byte-identical to source.

The new real-PG conjunction starts with `submitted({known:false})`, advances 30000ms (150000ms original attempt remaining), and binds through the unchanged I1 API. It asserts known/needed with job still running, independently checks the cleanup-specific context denial before claim, and exercises claim with/without maintenance. Two claim contenders use the existing real account-lock barrier in the no-maintenance variant. It checks null claims, failed/fenced job, one credit release after repeated operations, entire preserved submission and literal immutable ticket/deadline/counter/spend snapshots. No fixture SQL invents this transition. A known-before-loss/none positive control still recovers; a subsequent API rebind against its original immutable fence produces cleanup on a currently live recovered lease, proving context denial independently of expiry/terminal-job checks. A small marker unit in this file covers all four markers; it was syntax checked only here. All pre-existing lifecycle case oracles are byte-identical after removing the new cases/import addition.

Executed locally from PROJECT_ROOT, all exit 0:

```sh
/tmp/n8-node22 --version
/tmp/n8-node22 --check web/jobs.js
/tmp/n8-node22 --check web/provider-submissions.js
/tmp/n8-node22 --check tests/replicate-lifecycle.integration.test.js
/tmp/n8-node22 --test tests/jobs.test.js
/tmp/n8-node22 --test tests/provider-submissions.test.js
git diff --check
```

Node v22.20.0; jobs 5/5 and provider 2/2. Scope and protected-byte/hash checks passed. Frozen three-file hashes and seven protected I1/I2/I3 file hashes are in `docs/telemetry/n8-20261002-1740/replicate-i4a-f1-snapshot.json`; exact local commands/output in `replicate-i4a-f1-checks.json`. No DB, host listener, provider, network, Docker, install, delegation, commit, push, run-events or global configuration action. Unchanged generation tests were not repeated.

Pending coordinator execution after this freeze (commands as data, not executed here):

```sh
node --test tests/replicate-lifecycle.integration.test.js
node --test tests/replicate.integration.test.js
node --test tests/jobs.integration.test.js
```

Use the existing isolated Node22/PG16 runner and dedicated F07 DB ownership controls. Fresh affected independent review must close F1 against this snapshot; I4a remains unaccepted until runtime proof/review. Existing previous green PG results are historical and are not claimed as execution of this correction. Mutation proof for the affected guards remains a coordinator gate if required by the accepted verification plan. No expansion to hosted completion, worker wiring or remote cleanup execution.

Profile `compact-quality-first-v2`; mechanical route M/exit0, substantive XL invariant/credit-release correction under explicit owner authorization. Requested Sol6.1/high; actual model/effort/usage/cost null pending host attestation. Companion applies to source-bound handoff; E2E preflight not_applicable because DB/E2E execution is outside this writer scope. Elapsed timing and substantive terminal receipt: `docs/telemetry/n8-20261002-1740/replicate-i4a-f1-receipt.md`.
