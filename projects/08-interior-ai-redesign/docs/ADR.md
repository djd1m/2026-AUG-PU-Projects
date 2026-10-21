# N8 — ADR register v0.1

Status of ADR-001…010: **proposed implementation decisions under authorized scope**, pending independent validation. Owner has selected A and authorized autonomous code/spec corrections; status is not evidence of implementation. All IDs are immutable; changed decisions get dated amendments/reasons/tests.

| ID | Context and decision | Alternative rejected / consequence | Requirement → algorithm → tests |
|---|---|---|---|
| ADR-001 | Reuse N6/N5 Next/TS/Postgres modular monolith; pure domain public subpaths, concrete adapters and composition root | Copying an entire app drags donor business rules; new framework/microservice stack wastes bounded scope | FR-foundation-1/2 → Authenticate/ProjectCommand → auth/ownership/module-import-guard |
| ADR-002 | Manual measured rectangle+openings and self-contained GLB first; immutable shell with calibration and unknown physical accuracy | Splat/AI image cannot be metric evidence; broad format import waits for fixtures | FR-space-1/2, FR-design-1 → CalibrateSpace/StorePrivateAsset/ValidateAndRenderScene → calibration/asset-boundaries/shell-mutation |
| ADR-003 | One deterministic Babylon renderer, constrained declarative scene, manual/preset mode fully useful | Arbitrary generated code/shell meshes prohibited; no automatic photorealism promise | FR-design-1/2/3 → scene/revise/proposal procedures → schema-negative/geometry/browser-viewer |
| ADR-004 | Postgres N4 lease+fence plus once-only dispatch marker; no automatic retries after uncertain live call | Redis/BullMQ already available donors but adds service without transactional admission benefit here; pg-boss considered at feature reuse gate | FR-design-3, NFR-cost-1 → SubmitAndRunProposal → two-worker/midnight/uncertain-budget |
| ADR-005 | Manual official-source product snapshots; CatalogueProvider can return blocked; regions/time/unknown explicit | Retail scraping 401s cannot be promoted to live catalogue; no CAPTCHA bypass | FR-procurement-1 → RecordProductSnapshot → blocked/stale/region-change |
| ADR-006 | Exact decimal quantities and integer minor-money, immutable budget snapshots, unknown separate from zero | Floating-point sums and silent missing delivery create false total | FR-procurement-2/3, NFR-integrity-1 → CalculateBudget/ReplaceAndPhase/ReviseAndApprove → pack-boundary/unknown/phase/CAS |
| ADR-007 | Adapt N6 ЮKassa, payment default off, trusted SKU, credits+export entitlement, event transaction and refund hold | Fake storefront and client-return confirmation unacceptable; subscriptions/commissions excluded | FR-billing-1/2 → Checkout/ApplyVerifiedPayment → off/config/duplicate/refetch/rollback/refund |
| ADR-008 | Private revocable share of reencoded visual only, owner preview, free watermark; public gallery deferred | Full project sharing leaks measurements; SEO gallery adds public-content lifecycle outside bounded homeowner core | FR-sharing-1/2 → ExportAndShare/RecordGrowth → redaction/revoke/cache/watermark |
| ADR-009 | Local private asset adapter from N6, bounded decoders, authorization on each GET; S3 port retained | Public upload directory violates isolation; deploying MinIO now unnecessary | FR-space-2, NFR-security-1 → StorePrivateAsset/GuardRequest → cross-owner/URI/bomb/orphan |
| ADR-010 | Default no external paid activity; exact config+caps and provider guardrail required; 8h target/10h autonomy cap do not waive checks | Target speed is owner's delivery constraint, not throughput proof; stopping unverified is preferable to claiming success | NFR-cost-1/operations-1/performance-1 → proposal/boot/bounds → config/no-egress/compose/bench |

## Amendment log

Validation corrections are recorded below; no application implementation yet. For each future change record `timestamp, decisionId, before, after, requirement IDs, rationale, rejected alternative, source/spec/code revisions, checks rerun/results`. Never silently edit a requirement solely to make a test green. Concrete autonomous changes stay within owner authorization; paid spend/public publication are separate actions.

## Growth disposition

| Seed / original ID | Decision | Downstream coverage |
|---|---|---|
| FR-GROWTH-101 private preview | MVP preview and manually copied private link | FR-sharing-1, SC-US-014-1/2 |
| FR-GROWTH-102 guest preference | Defer in-app voting/comments; close person views image and discusses outside app | FR-sharing-1; no ghost feedback event |
| FR-GROWTH-103 selected content/revoke | MVP image+caption only, no size/address/budget by default or hidden fields | SC-US-014-2/3, share-privacy tests |
| FR-GROWTH-104 viewer begins own project | MVP link to own registration/project, no copy of source private inputs | FR-sharing-2, SC-US-015-1 |
| FR-GROWTH-105 store partnerships | Deferred by explicit owner instruction | No MVP provider credentials/affiliate tables |
| Original FR-GROWTH-001 | First design view contains share/export affordance | SC-US-014-1, first_design_viewed event |
| Original FR-GROWTH-003 | Free watermark, verified package removes it | FR-billing-1/2 + FR-sharing-1, export-entitlement |
| Original FR-GROWTH-005 | Public SEO gallery deferred: moderation/rights/indexable value unavailable in this delivery | Private homeowner chain remains complete |
| Original FR-GROWTH-004 | Realtor/blogger affiliate program deferred with wider partner scope | No incentive/CAC/revenue-share claims |

Partner deferral does not remove shopping links. Export/share-created metrics are observable; actual social publication rate remains unmeasured without direct evidence.

## 2026-10-13 validation amendments (owner autonomous authority)

ADR-001/009: one custom socket-peer HTTP entrypoint,72 UTF-8-byte bcrypt bound, rate-before-parse and finite asset resource reservations; no new authentication framework/parser engine.
ADR-004/010: exact consent request snapshot, dispatch mark as linearization, detached late draft, idempotency replay before admission, local audited reconciliation; retain uncertain holds across midnight and no paid retries.
ADR-006: complete immutable budget input, element-bound quantity sources/wall opening subtraction, server-computed reserve enum and phase preview. Client custom reserve amount rejected; history never derives from mutable current rows.
ADR-007/008: distinct partial-refund verification by refund→payment→order; server export provenance and refund revocation of unwatermarked derivatives. Private pixels require owner preview; no claimed automatic pixel redaction/OCR.
All retain owner CJM/core scope and mandatory checks; reasons and before/after source hashes in validation/fix-source-manifest.json. Provider capability inventory unchanged. No paid call/public release authorized.
