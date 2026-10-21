# N8 Phase 2 — validator-pseudocode narrow closure

- RUN_ID: `20261013T202009Z-expanded-cjm-9f69`
- WORK_UNIT_ID: `validator-pseudocode-2`
- TRACE_PATH: `/tmp/n8-validator-pseudocode-20261013/projects/08-interior-ai-redesign/docs/validation/validator-pseudocode-fix.md`
- Launch UTC: `2026-10-13T21:45:26.416917+00:00` (coordinator telemetry event `validator-pseudocode-2-start`).
- Repository revision: `3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4`; the documents are untracked inputs, so SHA-256 is authoritative.
- Profile/stage: `compact-quality-first-v2` / `VALIDATE`; narrow recheck of PSEUDO-01…07 only. E2E preflight: `not_applicable` because this is document validation.
- Requested model/effort: `gpt-5.6-sol` / `high`. Actual model, actual effort and fallback: `null`; host-authoritative execution metadata were not exposed.
- Token/cost usage and available spend: `null`; no attempt-exclusive counters or budget telemetry were exposed. No savings claim is made.

## Frozen source identity

| Source | SHA-256 | Manifest match |
|---|---|---|
| `docs/Specification.md` | `a33255dc6f9dd1058108cf26968db630ba7584ffe9948349465bb78851aea8b3` | yes |
| `docs/Pseudocode.md` | `ac6df814f53a52ab5be225cc9f2ff9e7728339f65b17abb9ee0d018ad39690d7` | yes |
| `docs/Architecture.md` | `5bfc8c2debc9f0ba67a028d3d348a3b4e63483943eed2fe38b0c1b21845345ee` | yes |
| `docs/Refinement.md` | `c6e9813f10856e51df77e4959812ec09faaa7fe4df22676a2608beb8d640929d` | yes |
| `docs/ADR.md` | `4c6423846d8600bd1cf47591a5883da18e8d29042be916aaaf62fad40e91f6bc` | yes |
| `docs/validation/fix-source-manifest.json` | `01a8f35e20a9d43952a39aa2aaf013801fef6cd2e4e74b3268ff19052fabc1ef` | self |

The manifest's `after` hashes match all five reviewed normative files. The final Pseudocode hash includes the coordinator's narrow pre-body guard clarification and original/normalized asset readiness correction made during this recheck.

## Verdict

**READY for this pseudocode lens: PSEUDO-01…07 are closed.** Score: **98/100**, up from 68/100. The two unawarded points reflect that runtime code/tests do not exist yet; that is expected at this planning gate and is not a remaining document blocker.

Deterministic structural check: **22 unique requirement headings ↔ 22 unique `REQUIREMENT` keys; 65 unique Specification SC ↔ 65 unique `REALISES` SC; no missing or extra key/SC**. Supporting procedures repeat two parent SC references as secondary links, but the unique sets remain exact and no duplicate requirement declaration was introduced. `FR-procurement-4` / `SC-US-025-1` has a concrete owner-only immutable-snapshot CSV algorithm and API route.

## Finding closure

| Finding | Result | Source-bound evidence |
|---|---|---|
| PSEUDO-01 idempotent job replay ordering | **CLOSED** | `SubmitAndRunProposal` looks up key/hash before mutable eligibility, credit and caps; same-hash replay returns the original job after success/archive/shell change, while a changed hash returns 409. Exact consent bytes and origin version/design are persisted. |
| PSEUDO-02 reproducible budget snapshot/delta/reserve | **CLOSED** | `BudgetLine` now embeds stable element identity, selection, retained reason, quantity source/provenance, phase, fit and product snapshot; `CostRow` has stable ID and explicit excluded+reason. Delta matches stable IDs/units. Reserve base is a server-computed enum and arbitrary client `reserveBaseMinor` is absent from the request. |
| PSEUDO-03 material quantity basis | **CLOSED** | `floor_area` is floor+m² only; `wall_area` derives named-wall length×height minus its openings; `surface_area/manual` require confirmed quantity and source shell, including GLB. Unit combinations reject guesses. |
| PSEUDO-04 missing commands/read surfaces | **CLOSED** | Owned bounded GET products/lines and blocked/manual refresh are specified. Growth uses a local read-only typed 30-day query. `ReconcileJob` is a local audited supporting procedure with expected fence/state, evidence ID, once-only account/global ledger settlement, credit outcome and no network/redispatch. |
| PSEUDO-05 semantic SC orchestration | **CLOSED** | Camera persistence was deliberately narrowed: orbit is transient and only design choices persist; export uses one current camera. Shell/design changes invalidate the current budget. Phase edits return an immediate deterministic preview while the stored prior budget remains explicitly outdated pending recalculation. New focused SC cover these decisions. |
| PSEUDO-06 boundary cardinality and normalized readiness | **CLOSED** | References require exactly one asset or URL; snapshot creation no longer pretends to validate an absent element and binding occurs in the line command. For images, `StorePrivateAsset` preserves original bytes, creates a separate reencoded normalized/thumbnail object, verifies both files/hashes and sets `ready` only after both exist; failure cleans both keys and reservation. GLB is explicitly original-only. |
| PSEUDO-07 boundedness/complexity claims | **CLOSED** | Archive/revocation is indexed and set-based with cost stated as affected lifetime rows rather than a nonexistent count cap. Growth reporting is bounded to 30 days and backed by kind/createdAt indexing. |

## Remaining blockers and limits

Remaining concrete blockers within PSEUDO-01…07: **none**. The prior seven semantically partial SC now have explicit state, command or narrowed acceptance semantics. Actual migrations, adapters, concurrency barriers, asset failure cleanup, snapshot reproduction, CSV injection handling and runtime tests remain future implementation evidence; this receipt does not claim they passed.

No project source was edited by this validator; only this isolated receipt was written. No paid inference, payment or public action occurred.

Finished UTC: `2026-10-13T21:48:14.640570258Z`; elapsed from launch: `168224` ms. Active time is `null` because complete exclusion intervals were unavailable. Final source hashes matched the rebound manifest; receipt was a regular non-symlink file and the terminal marker is last.

Status: completed
