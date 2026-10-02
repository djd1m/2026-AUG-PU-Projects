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
