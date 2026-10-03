# Architecture Decisions

## ADR-001 — depth-conditioned generation
Accepted design2026-10-02: Stable Diffusion + ControlNet-depth in separate worker. OpenAI-only instruction applies coding agents; product imagegen exception is explicit. Prompt-only generation rejected. Runtime quality and latency remain unverified until actual GPU corpus. PD-QUALITY-001 accepted.

## ADR-002 — transaction owns credits and jobs
PostgreSQL queue and ledger share one transaction boundary. Reserve once, fence each attempt, release once on terminal failure. Redis unnecessary; network/image work outside locks. Lease30s, heartbeat10s, deadline180s and attempts2 are initial bounded values, revisited only with measurement.

## ADR-003 — provider-verified generation pack
PD-MONEY-001 accepted under owner autonomy instruction recorded in `decisions-owner.md`; 20 generations/900RUB hypothesis. YooKassa hosted checkout plus API status verification; no invented signature. Free1, no payouts/subscription/referral rewards. New external spend0 and no actual charges. Old N6 time-plan/commission logic deliberately not copied.

## ADR-004 — small web surface and private media
Node22 ESM API + native UI avoids a framework build for this bounded MVP. Auth, SQL, image normalization and provider integration reuse inspected N5/N6 patterns with local tests. Private volume never publicly mounted. Public media limited to consented composite; runtime images must be quality accepted before public indexing.

## ADR-005 — labelled fixtures and evidence
Fixture worker/test payment exist only explicit local test mode. They exercise flow/security and cannot pass geometry, GPU latency or real provider gates. Quality unverified/rejected are separate from job status; stale worker never publishes. Pipeline walkthrough records evidence as work evolves; no fabricated production claims.

## ADR-006 — hosted depth inference and conservative remote effects

Accepted software design2026-10-03 after F07 PLAN/VALIDATE and I1–I6 independent slice closures. Dated specialization of ADR-001/002/005: explicit replicate uses the pinned hosted depth contract; explicit local controlnet and its historical proof remain. [Original F07 spec](features/f07-replicate/01_specification.md) SHA256 `2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad` is unchanged.

DB cannot make remote HTTP exactly-once. Commit preflight→submitting CAS and conservative envelope reservation before one create invocation; never replay ambiguous/submitting work. Known ID recovery uses GET under the original attempt/ticket/deadline with a new fence. This sacrifices automatic retries after paid submission, including failure/cancel, to bound invocation count. Reservation never decrements; customer credit release is a separate local effect, not provider refund. Migration007 creates submission/envelope authority,008 adds closed hosted evidence while retaining historical rows.

SEC-02 explicitly specializes Replicate JSON response to512KiB and request384KiB for sanitized≤256KiB JPEG data URI; other providers remain64KiB, all calls≤5s/original budget. Input stays private; delivery is strict HTTPS/public-IP-pinned and≤10MiB/20MP/single frame. Public predicates admit controlnet OR replicate only with accepted hash-bound quality/consent/hold checks. No fabricated local provenance: provider hardware/warm/inference/bill and sources are null. PERF-03 warm≥30/p95≤25s remains unchanged/unmeasured.

Cleanup is independent default-false opt-in, private token WeakMap, no create authority:30s fenced claim, one persisted cancel request then GET on later passes,5s remote window, stop by submitting+1h as unresolved if unknown. A crash can leave cancel recorded but unsent; only observed canceled confirms. No erasure, instantaneous stop or billing ceiling guarantee. Generic prompt-only generation/public input URL/hidden POST retry/new scheduler/GPU fallback are rejected.

Real license/privacy/safety/corpus/billing controls and provider deployment/pilot are pending with external spend0. Proposed36 creates/12USD (0.30USD modeled reservation/create) is not approval or a provider guarantee. I7 runtime, fresh integrated Astra review and I8 actual52+2 browser/hosted-row restore remain gates; draft PR is not release.
