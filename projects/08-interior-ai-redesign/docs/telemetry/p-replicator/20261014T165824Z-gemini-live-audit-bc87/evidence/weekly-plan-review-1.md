# Independent weekly provider contract plan review

Run-ID: 20261014T165824Z-gemini-live-audit-bc87
Work-Unit-ID: weekly-plan-review
Attempt-ID: plan-1
Source-Revision: 47c4e6fb3f1e336822f97af227a1e5f905925b28
Build-Revision: null
Launch-SHA256: 8351c3dc6c03e8cb2b07bdedbafcb95c85e0330926f69d48761bad6f1d6ce07b
Started-At: 2026-10-14T17:10:14.034961+00:00
Finished-At: 2026-10-14T17:11:39.075608+00:00
Duration-Seconds: 85.041
Actual-Model: null
Usage: null
Cost: null
Measurement-Gaps: Runtime model, token usage, and cost metadata unavailable; duration measured from caller launch timestamp through receipt creation.
Verdict: pass

Scope: Independent consequential plan review of AC-W01..05; source read only. No implementation, secret/environment reads, provider calls, DB writes, deployment, tests, or whole-product re-audit. Applied project-work-companion receipt contract; E2E preflight not_applicable for read-only PLAN review. Parent owns implementation and telemetry.

The minimal pair-based contract is acceptable. Both fields absent preserves the prior daily/globalDayCap contract. Explicit weekly 10,000,000 microUSD ceiling can coexist with application 5,000,000/day and 100,000/job because the existing application ledger independently reserves against account/global UTC-day caps. No table, framework, or reset scheduler is required.

Required implementation/review checks:
- Distinguish absent fields using undefined from blank/partial/null/malformed inputs in config and the public domain boundary. Reject unsupported reset strings and nonpositive/unsafe/noninteger caps; provider ceiling must cover job cap; explicit daily ceiling must not exceed global application day cap.
- Resolve expected reset and ceiling together before remote validation; verify exact reset, finite positive exact-micro cap within configured ceiling, sufficient remaining, and include_byok_in_limit === true. Preserve existing Decimal conversion rather than coercing or rounding unknown provider numbers.
- Keep worker verification before markDispatched and existing application cap/reservation/credit/fence/no-redispatch code unchanged.
- Meaningful tests include explicit weekly10M/applicationday5M pass; explicit daily10M/applicationday5M rejection; legacy weekly rejection; weekly-config remote daily/monthly/null/BYOKfalse/overcap/insufficient rejection; malformed config at both boundaries.
- Optional small consistency hardening: reject observed cap below job cap or remaining greater than observed cap, even when contradictory remote metadata claims sufficient remaining.
- Compose must preserve genuinely absent legacy fields; empty interpolated strings must not accidentally activate a partial/blank configuration. Document the paired deployment contract and independent limits.

No blocking design finding. The previously observed includeBYOK=false remains a live-readiness blocker under this plan. Configuration readiness and source review do not prove paid inference success. Full code review, regression/type/lint/build remain pending implementation; no test pass is claimed here.

Read-source SHA256 at receipt creation (root may be implementing concurrently):
- docs/features/gemini-weekly/01_specification.md: a1b4bd716851eea8f6c271a7bd3095c889b164f61b9ec2afaddcb481737093f1
- apps/web/src/server/config.ts: eec4e9a9e51c633cb687090a629588bf8336ddfc401bf9c3e96881f3d12ee923
- packages/domain/src/design/provider.ts: a8e02128852e11c4fc66ba19d98a14dfd03c4efac7b75d42c61e2bc08b9f9818
- packages/adapters/src/openrouter.ts: a609a95fe1a90e5855b351484dc739797e899e2f8618b013eb64f482891c5068
- packages/db/src/design/ledger.ts: db614727b92c80d2c498f72a982c9b94beb1a99b95233b28156b93b89d79db64
- apps/worker/src/jobs.ts: 6cd5cf91ad9c7a7c03ec0677987cd9573e8434181b7a7c589e49e92d97d8f9f1
- tests/design/provider.test.ts: c830f827fc83eb82b20e1e35485fb7720eba41ce0db00350141935a0d04fb1fe
- tests/foundation/config.test.ts: 8238bccfbdd76e6746113f32eb0c7739fa6abbc1d643aa6258ba98caa790d74f

Status: completed
