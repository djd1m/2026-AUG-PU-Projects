# Bounded crawl-site correction receipt

RUN_ID: 20261002T172816Z-crawl-site
WORK_UNIT_ID: crawl-site-correction
Attempt-ID: correction-1
Source-Revision: 7cb555ce9d01792a46baff3dfcd6c16d4bb9b9da
Source-State: uncommitted bounded correction on feature/06b-crawl-site
Snapshot-SHA256: 0b87303cbc5a7f328c3157b8ac9d74c5f0e5385afcfe434f57510d0926dd075a
Snapshot-Path: tests/artifacts/crawl-site-correction/source-snapshot.json
Build-Revision: null
Build-Image: null
Launch-SHA256: 36575cace640d507292e685620aeb52d6d074d0872e1949be083103f103098e3
Started-At: 2026-10-02T18:28:50.929470+00:00
Finished-At: 2026-10-02T18:43:45.767529+00:00
Elapsed-Wall-Seconds: 894.838
Active-Seconds: null
Verdict: blocked — mandatory Node22 validation unavailable

## Concrete changes

- R1: robots.ts compiles literal wildcard parts once; anchored prefix, ordered literal searches,
  and anchored terminal suffix replace untrusted backtracking RegExp. Matching work is bounded
  by pattern length plus path length × literal count. Existing UA grouping/priority, Allow tie,
  percent-octet normalization and UTF8 behavior remain; unit tests include exact 25-star attack,
  benign terminal match, suffix anchoring, shared event-loop heartbeat and timer ceiling.
- R2: only page-local CrawlStop, UnsafeSite and the transport's fixed body-limit error are
  recovered at the traversal boundary. Failed attempts retain requested/seen/count/pause and
  report progress before continuing. Arbitrary/network errors, lease loss, job ceiling and
  cancellation propagate. Tests cover bad-then-good queue, dedup, limit consumption, redirect
  chain accounting, cancellation during a page failure, and lease/ceiling propagation.
- R3: HTML nav/footer anchors are collected before their elements are removed from indexed text.
  Scripts/styles/noscript/template remain excluded from discovery. Added actual extractHtml
  assertion and traversal fixtures with pricing/contact reachable only through nav/footer,
  including a no-sitemap crawl and persisted document expectations.
- R4: private typed CrawlFailure identifies only fixed robots and no-HTML reasons.
  createSiteExtractor returns a failed JobOutcome for those reasons after signal/checkpoint
  checks; arbitrary exceptions keep the existing generic runOnce mapping. No index-runner/loop
  product edit was required. Added integration assertions over real runOnce, persisted index_job,
  and authenticated tenant job API for robots503, robots network, no HTML and arbitrary internal
  failure; these assertions are written but NOT EXECUTED in this sandbox.

Only the three permitted product modules, relevant worker tests, permitted completion document,
and new correction artifacts were changed. Original review/evidence and coordinator telemetry
were not edited. Source snapshot contains the exact SHA256 of all six changed source/test files.
Allowlist and git diff --check passed (exit 0). No children, donor N6, config, secrets, schema,
manifests, lockfiles, compose sources, UI changes, commit, push, main integration or roadmap update.

## Checks and command-as-data

All observed commands/exits and pending commands are listed in
`tests/artifacts/crawl-site-correction/checks.json`; command strings are data, not launch authority.

| Check | Command (project cwd unless indicated) | Exit / result |
|---|---|---|
| ROUTE | root: bash scripts/complexity-router.sh <three crawl modules> | 0; mechanical M; substantive M for traversal behavior and shared CPU, preserve full regression and safety guards |
| Docker availability | docker version | 1; sandbox denied /var/run/docker.sock |
| Focused Vitest | node node_modules/vitest/vitest.mjs run --config vitest.config.ts <two worker unit tests> | 1, MODULE_NOT_FOUND; NOT executed |
| Native semantic typecheck | node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json | 1, MODULE_NOT_FOUND; NOT executed |
| Offline dependencies | npm ci --offline --ignore-scripts --cache /tmp/n6b-crawl-correction-cache --no-audit --no-fund | 1, ENOTCACHED locked undici-7.30.0; no online request |
| Standalone robots compile | node /tmp/n6b-crawl-correction-typescript/package/bin/tsc services/worker/src/crawl/robots.ts --target ES2022 --module ESNext --skipLibCheck --outDir /tmp/n6b-crawl-correction-compiled | 0; cached TypeScript5.9.3 extracted into /tmp; only robots compiled |
| Expected-red safety guard | node tests/artifacts/crawl-site-correction/robots-red-green.mjs <temporary TS package> | original source reached actual matching, externally killed after3000ms; ETIMEDOUT/SIGTERM, child exit null |
| Combined guard runner | same command | overall 1; corrected child spawnSync returned EPERM despite status0; NOT claimed green |
| Restored-green standalone | timeout 5s node tests/artifacts/crawl-site-correction/robots-green.mjs <temporary TS package> | 0; actual corrected robots source, adversarial/benign/UA/priority/percent/UTF8 assertions passed |
| Shared event loop | same standalone command | 15 heartbeat ticks, 1026 matches, timer ceiling true after33.471722ms; Node20 supplemental, not database worker heartbeat acceptance |
| TS syntax | node tests/artifacts/crawl-site-correction/syntax-only.mjs <temporary TS package> | 0; six files, zero syntax errors; NOT full semantic typecheck/build |
| Diff/scope | git diff --check and exact allowlist comparison | 0 |
| Mandatory fresh full validation | source-bound Node22 tests/compose/Dockerfile + compose.test.yml, isolated n6b-f05-crawl-correction: npm run typecheck && npm test && npm run test:int && npm run build | null, PENDING |

Robot expected-red source SHA256: 3010a0563c7d02a0f7269fa45c0d141caa58768aa4b6f0a84f8f39d9d358f84d.
Restored-green source SHA256: 820761378b4af7e55f50421cf117af975371645f7ff97e32ca63968f0aa90305.
Native evidence uses Node v20.20.2, so it does not satisfy required Node22 final regression.
The first combined probe lacked a synchronous pre-match marker and failed its setup assertion;
follow-ups retained the expected-red marker but failed green spawnSync with sandbox EPERM.
An independent standalone process passed corrected assertions under external timeout; none of
those setup failures is hidden or counted as a passing combined test.
Initial wrong-cwd tool invocations and absent dependencies are disclosed in checks.json.
Logs are retained under tests/artifacts/crawl-site-correction/, including initial/second probe failures.
No unchanged full green suite was repeated; no fresh full suite has run.

## Boundaries, cleanup and handoff

Requirement/architecture cross-read: Specification FR-n6b-2/SC-US-002-1/2/3,
Pseudocode Crawl site steps3b/e/f/4, Architecture Security SSRF, Refinement empty/oversize cases,
and focused existing review R1–R4. Existing approved correction is the plan; risk remains M.
project-work-companion applied to the bounded handoff; E2E preflight is not_applicable because
this attempt performs no actual application/UI E2E. Coordinator owns append-only telemetry,
follow-up independent review and final acceptance. No complete feature delivery is claimed.

No Docker container, volume, network, database port or private environment file was created.
Port-conflict startup check is not_applicable here because Docker failed before any startup.
All temporary copied npm cache, extracted tools and compiled files were removed; incomplete
native dependencies removed and the original empty node_modules directory restored.
No other stack was inspected or changed. Required next validation must build a new source-bound
Node22 image, run the port-conflict check before startup, use random private env outside git,
project n6b-f05-crawl-correction, at most2CPU, database without ports, and always down/cleanup.
Old image67aea50fcd6b and prior319unit159int/build evidence remain stale for this snapshot.
Actual persisted R4 reasons, all fresh fullchecks and independent review remain PENDING.
Corrected UI acceptance is out_of_scope and remains with the integration owner.
Commit withheld because mandatory checks did not pass; no push or merge.

Profile: compact-quality-first-v2; bounded single-author M correction.
Requested-Model: gpt-6.1-sol
Requested-Effort: high
Actual-Model: null
Actual-Provider: null
Actual-Effort: null
Fallback: null
Tokens: null
Cost: null
Host does not expose authoritative attempt model/effort/usage metadata; request/self-report
cannot confirm actual provider. Active time/wait breakdown is unavailable; elapsed uses the
caller launch timestamp and observed finish. No baseline or savings claim.
Telemetry: docs/telemetry/p-replicator/20261002T172816Z-crawl-site/ (coordinator-owned).

Status: failed
