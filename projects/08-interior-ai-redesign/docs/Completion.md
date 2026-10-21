# N8 — Completion / local delivery contract

Status: **implemented and verified local delivery**. The six product modules, web, worker, PostgreSQL schema, private assets and offline-tested provider adapters are integrated. Public deployment, paid inference and live payment remain outside scope.

## Delivered implementation

| Area | Current implementation | Boundary |
|---|---|---|
| Foundation | auth/session, owner projects, exact-Origin and atomic rate guards, redacted health/logging | final composed browser journey passed on image 8 |
| Space | manual measured shell, private raster/GLB assets, references, plan and Babylon viewer | synthetic GLB tested; no actual Scaniverse device sample |
| Design | immutable revisions, approval/history, manual presets, fenced worker jobs and OpenRouter adapter | manual default; live Gemini quality/cost not measured |
| Procurement | manual provenance snapshots, exact packages, unknown costs, phases, substitutions and CSV | retailer pages returned 401; no bypass/automatic catalogue claim |
| Billing | off/live config, durable intent, provider refetch, exactly-once credits and refund hold | local default off; no real merchant/live payment claim |
| Sharing | normalized export, watermark entitlement, private expiring/revocable link and observed growth events | no public gallery or external analytics |

Every feature AC remains defined verbatim in `docs/features/*/01_specification.md`. The 65 criteria are mapped exactly once to existing literal test titles in `docs/features/*/05_completion.md`. FND-FINAL-1 is closed: the RED probe reproduced foreign-reference 422, the correction returned consistent 404 without side effects, 47 affected tests passed, and the full regression passed 229/229. The corrected source and final runtime checks are bound to image 9.

## Local delivery procedure

1. From the repository root run `bash scripts/check-port-conflicts.sh projects/08-interior-ai-redesign`.
2. In the project run `npm ci` and `npm run setup:local`. The generated private `.env` uses AI `manual` and payments `off`.
3. Run `docker compose build`, `docker compose up -d db`, `docker compose --profile tools run --rm migrate`, then `docker compose up -d web worker`.
4. Require successful `/health/live` and `/health/ready`. Web is loopback-only at `http://127.0.0.1:3088`; remote use goes through `ssh -N -L 3088:127.0.0.1:3088 user@server`.
5. Preserve image/source/config identity with test receipts. Stop only N8 containers; do not delete volumes needed for evidence or user data.

The database service uses `expose` only. Runtime app and migrator credentials are separate. No external provider call is needed for health or the manual homeowner path.

## Verification state

Completed evidence includes feature-level actual PostgreSQL/HTTP/filesystem tests, concurrency barriers, offline OpenRouter/ЮKassa fixtures, meaningful mutations, lint/typecheck/build receipts and independent reviews. Image 9 (`docker:sha256:3ac28e68ccef3576d428547f04bbbb9df3097bb8baf28823bdd87076611369cb`, build `z7Mp9IiPagz7p0uRCxACH`) passed the uninterrupted 21-check browser journey with no outbound/live calls. The source/image manifest matched all 148 runtime files.

`final-benchmark-4.json` records image 9 with 10 clients, 200 warm-ups, 1000 retained API measurements and p95 40.804434 ms; its pure 200-line case retained 1000/1000 golden hashes with one explicit unknown and p95 8.007006 ms. `restart-before-3.json` and `restart-after-3.json` bind image 9 to 12 equal checks covering two projects, revisions, budgets and original asset hashes, with readiness 200 and zero provider calls. The unchanged UI core passed 21 review checks. The hydration defect was reproduced RED on image 7, passed GREEN on image 8 and received an independent add-row closure.

The published `@dzhechkov/p-replicator@1.13.2` completion mode duplicates the project docs path and reports the real `Completion.md` as unreadable. The unmodified tool is therefore `NOT-ESTABLISHED`, not PASS. A temporary copy with the exact two-line variable-shadowing patch preserved validator logic and produced four PASS verdicts over 7 features / 65 criteria. See [pipeline checker compatibility](research/pipeline-checker-compatibility.md).

## External capabilities

OpenRouter live is fail-closed and requires key, allowlisted exact model ID, current rate validity, max tokens, request overhead, per-job/account/global caps, verified hard limit and operator enable. `google/gemini-4-argon` was observed as a candidate in the retained model catalogue; availability, tariff and fitness must be rechecked before activation. Current requests are bounded text/declarative scene JSON and cannot mutate the measured shell. No live call is authorized by this document.

ЮKassa live requires HTTPS origin, actual shop credentials, test-mode declaration and server-owned SKU JSON. Webhook content is not financial proof; the server refetches provider state. Default local payment mode is off.

Pinterest is supported as a saved public HTTPS link or user-uploaded image. No board/API import or server fetch is claimed. Retail catalogue refresh uses a blocked/manual-required adapter because tested pages returned 401; manual official links and provenance snapshots remain the supported path.

## Rollback and operations

Before a build change, retain the current image/config identity and backup owned database/asset volumes when data matters. On failure stop only N8 web/worker and restore a schema-compatible image. Test migration rollback only against disposable data; use a verified backup for destructive restore. A restart or restore must not redispatch uncertain paid jobs or replay payment events without provider evidence.

Local signals are `/health/live`, `/health/ready`, worker heartbeat, structured redacted logs, job reservations/uncertain state, payment verification/refund hold and asset cleanup. No PagerDuty, Slack, external log shipper or production SLO is configured.

## Documentation refresh receipt

This delivery-document refresh used profile `compact-quality-first-v2`, requested model `gpt-5.6-sol` with high effort. The execution host did not expose actual model or usage counters, so both remain `null`; no cost or savings claim is made. `dz recall` ran before edits and returned no lesson applicable to delivery prose. Final evidence reconciliation and verdict remain coordinator-owned.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|

The parent Specification contains no AC headings: this empty parent wire table is not acceptance proof. All 65 actual criteria live in the seven feature specifications/completion tables and their measured test/runtime/review receipts.

Final measured handoff:65/65 accepted; full229/229 plus separately targeted worker-crash1/1, no full230 claim. Tracked elapsed 5.453 hours; pre-record reading unmeasured. Requested Astra/high and Sol/high; actualmodel/usage/cost unavailable:null. Telemetry: `telemetry/p-replicator/20261013T202009Z-expanded-cjm-9f69/run.json`; receipt: `telemetry/p-replicator/20261013T202009Z-expanded-cjm-9f69/evidence/final-delivery-1.md`.
