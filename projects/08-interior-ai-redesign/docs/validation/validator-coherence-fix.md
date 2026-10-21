# N8 Phase 2 — validator-coherence closure

- RUN_ID: `20261013T202009Z-expanded-cjm-9f69`
- WORK_UNIT_ID: `validator-coherence-2`
- TRACE_PATH: `/tmp/n8-validator-coherence-20261013/projects/08-interior-ai-redesign/docs/validation/validator-coherence-fix.md`
- Launch UTC: `2026-10-13T21:49:08Z`
- Evidence completion UTC: `2026-10-13T21:50:11Z`; measured analysis interval: `63 s`
- Requested route: `Sol high`
- Actual provider/model: `null` — execution metadata remain unavailable; requested route is not evidence of the actual model.
- Usage/cost/available spend: `null` — provider counters and limits are unavailable.
- Scope: VC-B01–04 closure and direct cross-effects only. No broad research, new full review, source edit, or runtime-success claim.

## Verdict and score

**Closure verdict: NEEDS WORK.** VC-B01, VC-B02, and VC-B03 are closed. VC-B04 now has a normative requirement, story/SC, algorithm name, API, PRD scope, and refinement check, but two direct contract gaps remain before the coherence finding is closed.

Role-bounded coherence score: **88/100** (7/8 original binary checks pass; chosen-CJM export continuity remains partial). Exact requirement/SC joins, runtime claim boundaries, paid/public authority, ADR coverage, growth trace, and approval state all pass. The score does not override the incomplete algorithm and ownership contracts below.

## Closure evidence

### VC-B01 — closed

- Exact search over the eight Phase 2.9 downstream files finds every `ADR-001`…`ADR-010` at least once; result is **10/10**, superseded **0**.
- `docs/validation-report.md` contains the mandatory `## Decision Coverage` block with both gap tables explicitly `none`.

### VC-B02 — closed

- The actual seed rows now use stable `FR-GROWTH-101`…`FR-GROWTH-105`; original N8 obligations retain their separate `FR-GROWTH-001`, `003`, `004`, and `005` identities.
- `Specification.md` traces or rejects each 101–105 row with a reason and records the original obligations separately.
- `node .claude/hooks/check-growth-trace.cjs projects/08-interior-ai-redesign` returned exit `0`: all five seed obligations are traced or rejected with reason. This proves propagation only, not implementation.

### VC-B03 — closed

- `product-discovery-brief.md:104`, `cjm-design-brief.md:112` (`CJM-15`), and `source-product-profile.md:34–35` consistently say A is selected and the approval wait is cancelled.
- Paid inference/public publication and runtime readiness remain explicitly excluded or unproved.

### VC-B04 — partially closed

Present and mutually linked:

- `PRD.md:17` places owner-only CSV shopping-list export in F4.
- `Specification.md:141–144` declares `FR-procurement-4`, `US-025`, and `SC-US-025-1`, explicitly separated from public image sharing and linked to `CJM-12`.
- `Pseudocode.md:220–224,250` declares `ExportShoppingList`, claims the exact requirement/SC, and exposes owner-only `GET /api/projects/:p/budgets/:b/export`.
- `Refinement.md:87` names the snapshot, unknown/retained/provenance, formula-injection, cross-owner, and public-separation checks.

## Remaining blockers

### VC2-B04a — `ExportShoppingList` violates the mandatory Algorithm block shape

Severity: **BLOCKED source contract**.

The SPARC Pseudocode contract requires every `### Algorithm:` block to contain numbered steps and `COMPLEXITY: O(...)`. A mechanical block audit found:

```text
### Algorithm: ExportShoppingList|steps=0|complexity=0
```

The block has `REQUIREMENT`, `REALISES`, `INPUT`, and `OUTPUT`, but its behavior is one unnumbered paragraph and it has no complexity line. This is a direct cross-effect of the VC-B04 fix; exact ID equality alone does not make the new algorithm implementation-ready.

Correction: split the paragraph into numbered validation/load/serialize/return steps with explicit refusal paths and add bounded complexity, for example over budget lines and cost rows.

### VC2-B04b — F4 ownership/acceptance mapping still omits the new requirement

Severity: **MAJOR cross-document omission**.

`Specification.md:197` still maps F4 as `FR-procurement-1/2/3 | snapshots, budget-decimal, substitutions`. It omits `FR-procurement-4` and an export suite even though the PRD assigns the CSV to F4 and Refinement defines its check. An implementation dispatcher following the normative ownership table can therefore complete F4 without the chosen-CJM export.

Correction: include `/4` in the F4 machine-key abbreviation and add the owner CSV/export suite to the mandatory suite list.

No other VC-B01–04 closure defect was found in this narrow pass.

## Mechanical evidence

```text
check-docs-complete: exit 0 (11 documents present; correctness not implied)
Specification exact FR/NFR keys: 22
Pseudocode exact REQUIREMENT keys: 22
missing/extra requirement keys: none / none
Specification unique SC IDs: 65
Pseudocode exact REALISES SC IDs: 65
Refinement SC IDs: 65
missing/extra SC IDs: none / none
ADR downstream exact coverage: 10/10
check-growth-trace: exit 0
```

## Exact scoped inputs

Ordered SHA-256 manifest digest: `a70e11328d3a6e4d0c82a0c948092de732b03d2ef46bf1e9784d4669a1386f6a` (SHA-256 of the ordered `sha256sum` manifest below, including paths).

| Input | SHA-256 |
|---|---|
| `docs/Research_Findings.md` | `d06081113f90cb959df6083c52b5160eeb13ce4c127c5ba15f87a13a88a53ce7` |
| `docs/PRD.md` | `485f1d9230a7c01d991c76a22a0b0a6f473cf0c369c02f50c12b83d808ab407a` |
| `docs/Solution_Strategy.md` | `845c56b03812c56f338db64ef24eec626cc5bde0346f69de3f5e9d53e2713f47` |
| `docs/Specification.md` | `a33255dc6f9dd1058108cf26968db630ba7584ffe9948349465bb78851aea8b3` |
| `docs/Pseudocode.md` | `ac6df814f53a52ab5be225cc9f2ff9e7728339f65b17abb9ee0d018ad39690d7` |
| `docs/Architecture.md` | `5bfc8c2debc9f0ba67a028d3d348a3b4e63483943eed2fe38b0c1b21845345ee` |
| `docs/Refinement.md` | `c6e9813f10856e51df77e4959812ec09faaa7fe4df22676a2608beb8d640929d` |
| `docs/Completion.md` | `59e64f3fcfab60333107eabe845bcbd82e2a7b4fb341d68907684008f53769fa` |
| `docs/Final_Summary.md` | `4831298d9e1e8df1f4e833fccd5eaa317bd089f5e5c48433fafb30e76b4f26f3` |
| `docs/C4_Diagrams.md` | `88d59e8c3ad9596ee8eb1c08827dc263c4a8bc5de47d7d2ca1f5d3ab955c1317` |
| `docs/ADR.md` | `4c6423846d8600bd1cf47591a5883da18e8d29042be916aaaf62fad40e91f6bc` |
| `docs/project-input.md` | `cdb8a9eb5a1d3f5a9f2dc6d00e25e242625952df9b7fb575c9d75b31ae58e231` |
| `docs/product-discovery-brief.md` | `7ef3a4301ce902188e72237b1a981872c2accd29dfb08f3e6d8323e4033ee643` |
| `docs/discovery/cjm-design-brief.md` | `f06640b4ddf067fdeb02abff7e7124cab8541cb9d891b9d30ecfc4826eb70c0e` |
| `docs/source-product-profile.md` | `01f3ff4949f123044d6262d98f4943ab7ad7914554e37790fee7af210ad4e1f1` |
| `docs/validation-report.md` | `26d3d4879c89f6a40b22da92dc1ba0c34a1d133571d557380c517521ed7d5f11` |
| `README.md` | `7aeab42d12dc61adc8c6ce133c6a9d5fbfbbefc596a67d4d51335ca9bcebbe1e` |

Status: completed
