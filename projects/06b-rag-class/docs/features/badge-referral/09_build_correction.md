# F10 narrow production-build correction

Run-ID: 20261003T000534Z-badge-referral
Work-Unit-ID: badge-referral-build-correction
Attempt-ID: build-correction-1
Source-Revision: 4a4f602cda39954900365d3ba7085db7c4d732b3
Build-Revision: none
Launch-SHA256: eafd661cdcb5a5bfc5bfc380041876ddedd9f20f4a43f00b1612150667986603

## Cause and correction

`tests/artifacts/badge-referral/final-full-regression.txt`, lines 450–575, records a Next.js production compilation failure resolving Node modules `fs`, `path`, and `stream`. Every reported import trace reaches `pg` through `@n6b/db` and `apps/web/src/instrumentation.ts`. F10 introduces the first middleware and exposes the Edge compilation path. The previous negative runtime guard followed by dynamic imports does not give the compiler the required positive runtime branch around those imports.

The only product edit is `apps/web/src/instrumentation.ts`: put both existing dynamic imports and `enforceBootConfig(() => loadWebConfig())` inside `if (process.env.NEXT_RUNTIME === 'nodejs')`. The same Node startup validation remains mandatory and fail-fast; other runtimes perform no imports or config validation. No adjacent module, bundler polyfill, environment default, manifest, schema, or global/toolkit change was needed. Build-time configuration remains unnecessary.

## Scope and checks

Mechanical ROUTE: tier S, exit 0, one product file. Substantive ROUTE: bounded compiler-branch correction with startup invariants preserved; no public contract, schema, external call, or shared resource change. The caller explicitly limits checks to local typechecking and relevant boot-config units, reserves production build for the coordinator, and prohibits children, installs, network, Docker, builds, ports, and commits. E2E preflight: not_applicable; no E2E or new build is executed in this attempt.

- `timeout 90 npm run typecheck`: exit 0; root and web TypeScript checks passed. Evidence: `tests/artifacts/badge-referral/build-correction-1-typecheck.txt`.
- `timeout 90 ./node_modules/.bin/vitest run --config vitest.config.ts apps/web/tests/unit/config.test.ts apps/web/tests/unit/config-wiring.test.ts`: exit 0; 2 files, 97 tests passed. These cover required/empty/invalid config, bounds, connection roles, exit 1 without secret leakage, and configuration consumption. Evidence: `tests/artifacts/badge-referral/build-correction-1-boot-config.txt`.
- `git diff --check -- apps/web/src/instrumentation.ts`: exit 0.
- Recalculated all original 17 source/test hashes: unchanged. Original canonical snapshot remains `4f6cfc242b7863ba0f586b07a46b3cdbcd24cbb0d10360895c90679c11a94dff`. New `tests/artifacts/badge-referral/final-source-hashes.json` binds those 17 files plus corrected instrumentation. The original artifact was preserved.

## Pending and telemetry

Coordinator must rebuild the production candidate under the shared flock and record a fresh build revision/result. That build is out of this attempt's authorized scope; this note does not claim that it passes. Earlier full-regression counts (532 unit / 225 PostgreSQL checks) are historical evidence from the frozen snapshot, not checks rerun here. No syntax-mirroring test was added, and no independent review or compilation mutation was performed in this restricted attempt.

Profile: `compact-quality-first-v2`, with caller-selected `gpt-6.1-sol` / `high`, one executor. Native actual model/effort, usage, token counts, billing and active-time counters are unavailable inside this attempt and remain unknown; no fallback or switch was initiated. Elapsed time is measured from the launch timestamp in the final receipt, including instruction reading and checks. Run/event/work-record updates belong to the coordinator and were not edited here. Telemetry root: `docs/telemetry/p-replicator/20261003T000534Z-badge-referral/`. The caller's CLI `-o` captures the substantive final receipt at its allocated path; this attempt does not manually write that trace.

Verdict: bounded correction
