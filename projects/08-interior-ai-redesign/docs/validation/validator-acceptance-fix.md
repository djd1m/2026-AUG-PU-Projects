# N8 Phase 2 — validator-acceptance correction closure

- RUN_ID: `20261013T202009Z-expanded-cjm-9f69`
- WORK_UNIT_ID: `validator-acceptance-2`
- TRACE_PATH: `/tmp/n8-validator-acceptance-20261013/projects/08-interior-ai-redesign/docs/validation/validator-acceptance-fix.md`
- Launch UTC: `2026-10-13T21:43:55Z`
- Completion UTC: `2026-10-13T21:44:50Z`; measured receipt interval: `55 s`.
- Requested route: `Sol high`
- Actual provider/model: `null` — execution metadata unavailable; requested route is not proof of a model switch.
- Usage/cost/available spend: `null` — provider counters and budget are unavailable.
- Scope: closure of the original five acceptance findings only; no source edits and no runtime claim.

## Fresh source identity

| Source | SHA-256 |
|---|---|
| `docs/Specification.md` | `a33255dc6f9dd1058108cf26968db630ba7584ffe9948349465bb78851aea8b3` |
| `docs/Pseudocode.md` | `ea7bf1aaab679e2842e3d50c6675c7ca66de73672fe5b64bb2687473e6efd843` |
| `docs/Refinement.md` | `c6e9813f10856e51df77e4959812ec09faaa7fe4df22676a2608beb8d640929d` |
| `docs/test-scenarios.md` | `d4d00e5da4c1e51fa6811040d6f62cfb9cc6377281b1499a1693ea16558e0259` |
| `docs/model-cost-contract.md` | `68f54ba11877cd4ef5915a4c73672e10135189527b54ec02c16b0a0d6a087545` |
| `docs/long-job-contract.md` | `d688b8d42cb163f38c6334b531026a70f1925c7ddb6ff4b7a3b6b2b55f53c522` |
| `docs/webhook-contract.md` | `ee73fb64ee135e7ecdfdbbac355cc440e243e914193cf69240d7f8c0c4cbed3f` |
| `docs/validation/fix-source-manifest.json` | `898d0aa7083eee14fd649374f83a689b2eb7f26999bbc7af22fa3fadeddc4e76` |

The manifest records the correction pass, but its `after` values for `Pseudocode.md` and `Refinement.md` precede the final boundedness wording and explicit added-SC listing. The fresh hashes above bind this closure; no historical value was rewritten.

## Closure verdict

**Source-document verdict: CAVEATS.** The corrected plan is testable and traceable enough to proceed to implementation. It is not `READY` under the current Phase 2 command because two mandatory surface checks honestly return `2`. Those codes describe unavailable runtime evidence and one checker/provider contract mismatch; they are not requirement defects and cannot be rewritten as passes.

Revised acceptance-lens score: **45/50 (90/100 normalized, READY by the SMART + Quality score alone)**. The Phase 2 verdict remains CAVEATS because guard state is separate from the numerical requirement score.

| Dimension | Score | Correction evidence |
|---|---:|---|
| Specific | 6/6 | The four composite failures were separated and the former qualitative UI/asset oracles now name observable fields, labels, actions and network behavior. |
| Measurable | 8/8 | `SC-US-024-1/2` fix fixture/build/host identity, warm-ups, measured sample counts, nearest-rank p95, golden hashes, and failure on errors/timeouts/missing samples. |
| Achievable | 6/6 | Pseudocode claims every accepted SC with bounded local/offline paths; live calls are not acceptance prerequisites. |
| Relevant | 5/5 | Every added scenario is attached to an accepted FR/NFR and the CJM A local MVP. |
| Time-bound | 0/5 | Many domain/UI criteria correctly have an event boundary rather than a duration; the binary rubric point is conservatively withheld. |
| Traceability | 10/10 | The Specification, Pseudocode REALISES set and named `test-scenarios.md` set contain the same 65 unique SC IDs. |
| Completeness | 10/10 | Happy, error, boundary, security, concurrency and performance controls are now explicit, including the three previously incomplete story contours. |

The blocking floor is clear: all stories have actual AC, all 65 AC have named scenarios, and no trace set difference exists. `NFR-integrity-1` and `NFR-cost-1` remain cross-cutting machine keys realised by the adjacent revision/job algorithms and their named SC, rather than inventing duplicate NFR-only scenarios.

## Original five findings

| Original finding | Closure | Evidence |
|---|---|---|
| Applicable contract artifacts absent | **Partially closed; CAVEAT** | All three artifacts now exist. Model-cost declaration passes exit `0`. Long-job and webhook retain honest exit `2`; details below. |
| `NFR-performance-1` lacked an SC and reproducible protocol | **Closed** | `US-024`, `SC-US-024-1/2`, `EnforceBounds REALISES`, named BDD, exact clients/warm-ups/samples/p95/golden failure oracle. |
| Composite `SC-US-008-3`, `010-2`, `013-2`, `016-2` | **Closed** | Timeout moved to `008-4`; invalid numeric/unit input to `010-5`; provider timeout/replay to `013-4`; rate concurrency and log redaction split across `016-2` and `021-1`. |
| Story-local gaps in `US-011`, `US-016`, `US-018` | **Closed** | `011-4` rejects invalid substitution; `016-3` is the authorized control; `018-1` names keyboard actions/focus/labels/overflow, with `022-1` WebGL fallback and `023-1` restore/error focus. |
| Undefined qualitative oracles | **Closed** | `004-1` defines decode/re-encode, EXIF, MIME/nosniff and no external resources; `008-1` names exact off label and zero AI egress; `018-1` names canonical actions and `document.scrollWidth≤innerWidth`. |

## Actual requirement and AC mapping

Current scope has **22 machine requirement keys and 65 unique named SC**, expanded from the original 21/45 correction baseline by accepted security, performance and owner-CSV contours.

| Requirement | Stories | Named SC |
|---|---|---|
| FR-foundation-1 | US-001 | 001-1..3 |
| FR-foundation-2 | US-002 | 002-1..2 |
| FR-space-1 | US-003 | 003-1..2 |
| FR-space-2 | US-004 | 004-1..3 |
| FR-space-3 | US-005 | 005-1..3 |
| FR-design-1 | US-006 | 006-1..2 |
| FR-design-2 | US-007 | 007-1..3 |
| FR-design-3 | US-008 | 008-1..6 |
| FR-procurement-1 | US-009 | 009-1..3 |
| FR-procurement-2 | US-010 | 010-1..7 |
| FR-procurement-3 | US-011 | 011-1..4 |
| FR-procurement-4 | US-025 | 025-1 |
| FR-billing-1 | US-012 | 012-1..2 |
| FR-billing-2 | US-013 | 013-1..4 |
| FR-sharing-1 | US-014 | 014-1..3 |
| FR-sharing-2 | US-015 | 015-1..3 |
| NFR-security-1 | US-016/019/020/021 | 016-1..3, 019-1, 020-1..2, 021-1 |
| NFR-integrity-1 | cross-cutting | revision/CAS/fence scenarios in 007/008/010/013 |
| NFR-cost-1 | cross-cutting | job admission/reservation scenarios in 008-1..6 |
| NFR-operations-1 | US-017 | 017-1..2 |
| NFR-quality-1 | US-018/022/023 | 018-1, 022-1, 023-1 |
| NFR-performance-1 | US-024 | 024-1..2 |

Mechanical comparison found no Specification-only, Pseudocode-only, or test-scenario-only SC ID. `Specification.md` and `test-scenarios.md` each contain 65 unique IDs; `Pseudocode.md` claims all 65.

## Guard interpretation and feasible repair

| Mandatory command | Exit | What is established |
|---|---:|---|
| `check-model-cost.cjs` | 0 | The declaration names one authenticated outsider-triggered call, numeric 5/account and 20/day ceilings, attempt accounting, fail-closed startup and a usage address. The checker itself says this does not prove runtime enforcement or billing. |
| `check-job-contract.cjs` | 2 | The planned handle, pre-work issuance, 202/read route, three states, idempotency/fence and timeout relationship are declared; no deployed job observation exists. |
| `check-webhook-contract.cjs` | 2 | The YooKassa source+remote-refetch, atomic event key and reorder policy are declared; no implemented replay run exists, and the generic checker models raw-body HMAC that YooKassa does not provide. |

The exact Phase 2 rule in `.claude/commands/replicate.md` says for these conditional guards: exit `2` means **“проверка НЕ ВЫПОЛНЕНА”**, is never read as success, and its printed reason must enter the phase report verbatim. Unlike deterministic Step 2.0, this section does not say that exit `2` forbids aggregation or the `CAVEATS` verdict. Therefore the source gate may be CAVEATS with the required implementation checks below, but it may not be described as all-green or READY.

Concrete repairs:

1. After the job runtime exists, run actual queued/running/succeeded/failed/uncertain tests with observed job IDs, disconnect and same-key retry, two-worker dispatch, stale fence and timeout. Update `long-job-contract.md` to `ВЫПОЛНЕНА`/`ПРОВЕРЕН` only from those receipts, then rerun the existing guard. Pre-coding plan text is not a substitute.
2. Before payment delivery, add a provider-specific deterministic checker or extend the mandatory webhook checker with an explicit `source-ip+remote-refetch` authentication mode. That branch must require a trusted peer source, fixed provider endpoint, remote payment/refund identity checks, atomic sender-derived key, and existing spoof/replay/concurrent/reorder test files. Keep the current generic HMAC branch for providers that sign raw bodies. Requiring or inventing a YooKassa HMAC would be a false repair.
3. Run the actual provider-specific handler tests after implementation: forged source/header, foreign merchant/order/amount/test mode, remote verification outage followed by replay, concurrent duplicate, refund-before-late-success, and transaction rollback. Only those results may close the runtime caveat.

Required implementation gates remain exactly the named local/offline suites. No paid inference or live payment is needed for source validation, and none was claimed here.

## Verification receipt

- Fresh trace path was absent before launch and is a regular non-symlink file.
- Source set equality: 65 Specification SC = 65 Pseudocode REALISES SC = 65 named BDD SC; both `comm` comparisons were empty.
- Guard observations: model cost `0`; long job `2 not-deployed`; webhook `2 not-implemented`.
- No source document was changed by this validator.

Status: completed
