# N3a requirements-stage receipt

- `RUN_ID`: `20260909T174821Z-prd-a-1934`
- `WORK_UNIT_ID`: `requirements`
- Scope: chosen CJM A; `docs/PRD.md` and `docs/Specification.md` only; no implementation, architecture, algorithms, commit or push.
- Project: `projects/03a-affiliate-rewardful`
- Profile: `compact-quality-first-v2`; risk tier XL inherited from the approved money-flow plan.
- Requested execution: `gpt-5.6-sol`, effort `medium` (requirements-stage policy).
- Actual model/effort: `null`; this worker received no host-attested model metadata. No fallback was observed or claimed.
- Usage, cost, active time and available quota: `null`; no worker-scoped provider counter, billing counter, wait-union or quota counter was exposed.
- Elapsed wall time: `727773 ms` from the RUN_ID timestamp `2026-09-09T17:48:21Z` to measured checkpoint `2026-09-09T18:00:28Z`; this includes tool time and is not active-agent time.
- Baseline revision: `bccd5bb43131a2a9b363aadabdf38de47aa9ef96`.

## Inputs and source receipts

| Source | SHA-256 |
|---|---|
| root `CLAUDE.md` | `3f1e27b17ed1671988bafef56fe5d6c47680bf6efb87601ba1764a8eb347f241` |
| `docs/development/model-routing.md` | `cc958dec9cd12d0a83b0662fdb57d5a3f0874535f36bdf1d1e7b424f4660e1d9` |
| `sparc-prd-mini/SKILL.md` | `b663793d1e1d1de028f91f2e266a191811bb610f97a12be7f95d62327589d53a` |
| PRD template | `7b4497bc76bb421fae7a07ecb46af01e021412180a394a5487a3c3c42dc004b6` |
| `docs/implementation-plan.md` | `3b2ec51053845f0f6eaa424390b25abe9d89bdeb0485357108b5cf1ed07252a4` |
| `docs/product-discovery-brief.md` | `8de144c611a01f04807b79c09430677bc4bb951c6c951989d31a6c5ec08d54fa` |
| `docs/CJM_Variants.md` | `728d572f47e278e9408adc9349994aa2e0c98ecdea57120daa0ef5ff73a3f800` |
| `docs/source-product-profile.md` | `415f58a6cc14b61caa09de41ce3ce095a5d7ff1034192583b9adba89406fe791` |
| `docs/discovery/reuse-inventory.md` | `79a26ce2df755ca5f52dd655abe3bfccdd7fb4e679e0c0abbaa42126428b2688` |
| coordinator evidence `prd-source-evidence.md` | `779a955accbb2d88b2a6ca825965f720924bc0f2408cb778f21af2f33adef167` |
| coordinator evidence `tax-boundary-evidence.md` | `6ad12d82e6fb28cf088933dcc59d00432a5d1f2952d4a217d503d1e31a195353` |

The two coordinator evidence files were read from the read-only planning worktree
`/tmp/n3a-prd-plan`; the coordinator owns their integration into the target branch.

## Outputs

| Artifact | Lines | SHA-256 |
|---|---:|---|
| `docs/PRD.md` | 186 | `129b515dca77aa4ff878e3eab1903fd898305daecb2ddd556279a430ef79faa8` |
| `docs/Specification.md` | 494 | `ec2187fdc925ea283fac2744943cd7f3dbe1504e82c5fdf34158413035018b89` |

## Checks and corrections

- Structural check: 36 unique FR/NFR headings, 12 unique `US-xxx`, 36 unique
  `SC-US-xxx-n`; every scenario has Given/When/Then. Passed.
- Growth coverage: each `FR-GROWTH-001..004` has named happy/edge/security
  scenarios. Repository `check-growth-trace.cjs` exited 0.
- Seed preservation: exact four growth meanings and exact four `FR-LOOK` strings
  from the inputs are present (8/8). Passed.
- `check-look-trace.cjs` exited 2 because the pre-existing source profile lacks the
  required `Статус съёмки` header. This is a declared upstream profile limitation,
  not reported as green and not repaired because this work unit owns only PRD/Specification.
- `git diff --check` passed. Both requested documents are below 500 lines.
- Detected/corrected before handoff: Specification was 519 lines and reduced to
  494 without dropping requirements; PRD risk named N1 instead of N3a outage;
  FR-GROWTH-001 was tightened to owner-first real value and voluntary copy/native
  share without product-side sending; duplicate refund retry now returns the prior
  idempotent result while only mismatches enter review.
- The documents distinguish accepted owner facts from proposed defaults, reject
  20% as policy, keep MRR unknown without explicit facts, preserve manual N1
  renewal commissions, freeze monthly payout history, and fail closed on unknown
  tax/legal inputs.

No numerical savings claim is possible without measured usage and a comparable baseline.

Status: completed
