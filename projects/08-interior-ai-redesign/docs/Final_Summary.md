# N8 — Executive Summary

2026-10-14 · **Local modular application implemented and verified.** N8 connects a private measured room, references, design revisions, products, an exact/unknown-aware budget, payment capability and controlled sharing. The useful default product is manual and requires no AI, payment, Pinterest or retailer credentials.

## Product and technical result

The workspace contains six bounded modules: identity/foundation, space, design, procurement, billing and sharing. Next.js/React provides the local UI and guarded HTTP routes; PostgreSQL stores owner-scoped immutable history and ledgers; a separate worker handles bounded jobs and asset maintenance. Files stay private, the database has no published host port, and Compose exposes web only on `127.0.0.1:3088` by default.

The implemented homeowner path covers registration/project creation, manual room geometry and openings, references, deterministic plan/3D, manual design and approval, product snapshots and replacements, packaging/budget/phase history, CSV, export and private share/revoke. Unknown price, delivery, work or GLB surface stays explicit rather than becoming zero. Design scenes cannot transform the measured shell.

## Integrations and evidence boundaries

- OpenRouter: a fixed-endpoint, strict-schema, bounded adapter is exercised through offline HTTP fixtures. Manual AI is the default. The observed Gemini candidate `google/gemini-4-argon` still requires a fresh availability/rate/quality check plus all caps and operator authorization before live use; no paid inference result is claimed.
- Payments: the ЮKassa adapter verifies source and refetched provider state, durable intent identity, replay and refund holds in tests. Payments default to off; no merchant or live checkout is part of this delivery.
- Scaniverse: self-contained GLB parsing/calibration/viewing is tested with synthetic fixtures. No actual Scaniverse device export has been supplied as an acceptance sample, so device-specific compatibility and accuracy remain unknown.
- Pinterest: public HTTPS links are stored exactly and never server-fetched; private image upload is available. Pinterest API/OAuth board import is not implemented.
- Retailers: the sampled pages returned HTTP 401. The application therefore uses official deep links and manual provenance snapshots; it does not use CAPTCHA/proxy bypass or claim live stock/price integration.

## Verification state

All 65 feature AC retain their source wording and have one exact test mapping in the seven feature completion documents. FND-FINAL-1 is closed by the reproduced RED case, consistent foreign/missing 404 behavior, no-side-effect probes, 47 affected passes and the 229/229 full regression. Image 9 (`sha256:3ac28e68…11369cb`, build `z7Mp9IiPagz7p0uRCxACH`) matched 148 host/runtime files and passed the uninterrupted 21-check production journey with no outbound/live calls. Its API benchmark retained all 1000 measurements after 200 warm-ups across 10 clients at p95 40.804434 ms; the pure case retained 1000/1000 golden hashes with one explicit unknown at p95 8.007006 ms.

Restart receipts match two projects, revisions, budgets and original asset hashes before and after web/worker restart, with readiness 200 and no database recreation. Sharing received independent 9/9 closure; growth counts 9/3/2/2/2 are explicitly synthetic test events. The budget hydration defect moved from RED on image 7 to GREEN on image 8 and has an independent add-row browser closure. The full regression was 228/228 before two late fixes; the affected 13 sharing tests and actual-browser closures passed afterward, without claiming a repeated 228/228 run.

The image-8 browser, benchmark and restart receipts remain factual historical evidence. Image 9 carries the corrected source, full regression, 21-check journey, benchmark and a passing 12-check before/after restart comparison for two projects with readiness 200 and zero provider calls. The published pipeline checker 1.13.2 also has a project-completion path-joining bug: the unchanged tool is `NOT-ESTABLISHED`, while a SHA-recorded temporary two-line compatibility copy yields four PASS verdicts for 7 features / 65 criteria without changing validation logic. Details are in [pipeline checker compatibility](research/pipeline-checker-compatibility.md).

## Run and access

The concise path is `npm ci`, `npm run setup:local`, Compose build, database start/migration, then web/worker start. Health is checked at `http://127.0.0.1:3088/health/ready`. A remote server remains private and is accessed through `ssh -N -L 3088:127.0.0.1:3088 user@server`. Full commands and shutdown guidance are in [INSTALL.md](../INSTALL.md); development contracts are in [DEVELOPMENT_GUIDE.md](../DEVELOPMENT_GUIDE.md).

## Reuse and provenance

Implementation followed local N1–N7 inspection before GitHub/source review. Feature receipts record donor paths and hashes, external revisions/licenses, compatibility and use/adapt/reject decisions:

- [foundation](features/foundation/reuse.md), [space](features/space/reuse.md), [design](features/design/reuse.md);
- [procurement](features/procurement/reuse.md), [billing](features/billing/reuse.md), [sharing](features/sharing/reuse.md).

No sibling project is imported at runtime. Key reused libraries and APIs include PostgreSQL/pg, Zod, Decimal.js, stable JSON serialization, Sharp, Khronos glTF Validator and Babylon.js; N8-specific invariants, ownership transactions, scene validation, budget snapshots and entitlement/refund coordination remain project code.

## Documentation package

The normative chain remains [PRD](PRD.md), [Specification](Specification.md), [Pseudocode](Pseudocode.md), [Architecture](Architecture.md), [Refinement](Refinement.md) and [Completion](Completion.md). Decisions and caveats remain in [ADR](ADR.md), [decision log](decision-log.md), [research](research/) and feature implementation/review receipts. Delivery-document refresh used profile `compact-quality-first-v2`, requested `gpt-5.6-sol` high; actual model and usage were unavailable (`null`).

Final measured handoff:65/65 accepted; full229/229 plus separately targeted worker-crash1/1, no full230 claim. Tracked elapsed 5.453 hours; pre-record reading unmeasured. Requested Astra/high and Sol/high; actualmodel/usage/cost unavailable:null. Telemetry: `telemetry/p-replicator/20261013T202009Z-expanded-cjm-9f69/run.json`; receipt: `telemetry/p-replicator/20261013T202009Z-expanded-cjm-9f69/evidence/final-delivery-1.md`.
