# N8 Phase 2 — validator-coherence

- RUN_ID: `20261013T202009Z-expanded-cjm-9f69`
- WORK_UNIT_ID: `validator-coherence-1`
- TRACE_PATH: `/tmp/n8-validator-coherence-20261013/projects/08-interior-ai-redesign/docs/validation/validator-coherence.md`
- Launch UTC: `2026-10-13T21:31:16Z`
- Evidence completion UTC: `2026-10-13T21:36:20Z`; measured analysis interval: `304 s`
- Requested route: `Sol high`
- Actual provider/model: `null` — execution metadata are unavailable to this worker; the requested route is not evidence of a model switch.
- Provider usage/cost: `null` — no provider counters are exposed.
- Available spend: `null` — provider budget/limit telemetry is unavailable.
- Repository revision: `3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4`; the project package is an uncommitted source set, so the hashes below are authoritative.
- Scope: independent cross-document coherence, exact identifier contracts, chosen CJM A continuity, authority/readiness claims, and growth disposition. Known queued acceptance/architecture findings were excluded from this lens. No project source was edited.

## Verdict and score

**Coherence verdict: NEEDS WORK for Phase 2 aggregation.** Phase 2 requires no contradictions and its mandatory decision-coverage step has not been satisfied.

Role-bounded coherence score: **50/100**. This is a transparent eight-check audit, not an INVEST/SMART story score: exact requirement set PASS; exact SC set PASS; runtime/not-run boundary PASS; paid/public authority boundary PASS; ADR downstream identity FAIL; growth seed identity/trace FAIL; current approval state FAIL; chosen-CJM export continuity FAIL. A numeric average cannot override the failed Phase 2 contracts.

Positive joins:

- `Specification.md` declares 21 unique exact FR/NFR machine keys; `Pseudocode.md` claims the same 21, with no missing or extra key.
- `Specification.md` declares 45 unique `SC-US-*` IDs; `Pseudocode.md` claims all 45 and `Refinement.md` mentions all 45, with no missing or extra ID.
- The SPARC package and README consistently say the application is planned/not delivered and live inference/payment/public deployment are not authorized or not run. No contrary runtime-success claim was found.

## Findings

### VC-B01 — all ten ADR identities disappear downstream

Severity: **BLOCKED Phase 2 structural gate**.

`docs/ADR.md` declares `ADR-001` through `ADR-010`, but an exact-token search over the eight files mandated by `/replicate` Phase 2.9 found **0/10** named downstream: `PRD.md`, `Solution_Strategy.md`, `Specification.md`, `Pseudocode.md`, `Architecture.md`, `Refinement.md`, `Completion.md`, and `C4_Diagrams.md` contain no `ADR-<nnn>` token at all. The prose often agrees semantically, but Phase 2 explicitly says a title or paraphrase is not a mention. Consequently the required Decision Coverage block would report every current decision as “recorded but named nowhere”.

Correction: add meaningful exact references at the authoritative points rather than a detached bulk list: architecture/reuse for `ADR-001`; measured shell/import for `ADR-002`; renderer/scene boundary for `ADR-003`; job dispatch/spend for `ADR-004`; catalogue fallback for `ADR-005`; exact budget/versioning for `ADR-006`; payment/refund for `ADR-007`; private sharing for `ADR-008`; private asset storage for `ADR-009`; and local/no-spend delivery for `ADR-010`. Then generate the two-way `## Decision Coverage` block required by Phase 2.9.

### VC-B02 — the applicable growth seed uses an unrecognized ID family and bypasses its validator

Severity: **BLOCKED trace gate**.

`product-discovery-brief.md` has five populated rows under `## Growth Requirements Seed`, but names them `G-01`…`G-05` (lines 63–73). The pipeline and requirements-validator contract require exact, case-sensitive `FR-GROWTH-<nnn>` seed IDs. Running

```text
node .claude/hooks/check-growth-trace.cjs projects/08-interior-ai-redesign
```

returned exit `2`: `в брифе нет ни одной заполненной строки FR-GROWTH-nnn`. This is not “no applicable growth”; the same file contains populated growth obligations. `ADR.md` then mixes two unrelated namespaces: it disposes `G-01`…`G-05` and separately cites original `FR-GROWTH-001`, `003`, `005`, and `004`. Because the current seed has no contract-valid identity, exact propagation/rejection into `Specification.md` cannot be established and the deterministic gate is bypassed.

Correction: assign stable `FR-GROWTH-nnn` identities to the actual seed without reusing an existing ID for a different meaning, preserve the original N8 growth IDs as their own obligations, and record an explicit traced or reasoned rejected disposition for every resulting exact token in `Specification.md` (or the contract-approved rejection record). Re-run the growth hook; exit `2` is not a pass.

### VC-B03 — revoked approval wait is restored by two active discovery contracts

Severity: **MAJOR contradiction**.

Current authority is unambiguous: `project-input.md:111–113`, `README.md:56–59`, `Specification.md:3–4`, and `cjm-design-brief.md:3–6,121` say A is selected and the separate CJM approval wait was cancelled. Two still-active statements say the opposite:

- `product-discovery-brief.md:104` says the next allowed result ends by requesting explicit choice/approval and that full PRD/code may not begin before it.
- `cjm-design-brief.md:112` (`CJM-15`) still requires the button outcome to state that owner selection and chat approval are required, even though that same brief says they already occurred. The generated `cjm-a.html` has already been corrected to say the local mark does not change the selected A, so the brief and its accepted artifact now disagree.

The latest owner instruction governs this run, so no new approval is needed. The stale source text can still make a resumed agent stop incorrectly or reintroduce an obsolete checkpoint.

Correction: amend the historical brief with a dated supersession note and update `CJM-15` to assert that the local prototype choice is non-authoritative because A is already selected, matching `cjm-a.html`.

### VC-B04 — chosen CJM A's owner-only shopping-list export is absent from the SPARC contract

Severity: **MAJOR product drift**.

The selected design contract requires at `cjm-design-brief.md:109` (`CJM-12`) an export preview containing selected shopping rows, units, amounts, and demo status; `cjm-a.html:242–243` implements a local shopping-list preview/download. The 11-document SPARC package replaces this with a different export:

- `PRD.md:19,33` promises only a watermarked before/after image.
- `Specification.md:108–113` defines only PNG before/after export and private image sharing.
- `Pseudocode.md:155–162,229–230` implements `ExportAndShare` and `/exports` solely as a watermarked image asset.
- `ADR.md:28` narrows the public share payload to image+caption, but does not dispose the separate owner-only shopping-list export.

Thus the user can calculate a shopping list but cannot perform the chosen A export action that was validated in discovery. No requirement/SC/algorithm explicitly rejects or defers it, so this is silent loss rather than a recorded scope decision.

Correction: either add an owner-only procurement export requirement, SC, algorithm/API and test preserving row provenance/unknown statuses, or explicitly defer `CJM-12` shopping-list export with a reason while keeping the private-share payload decision separate.

## Evidence and limits

Mechanical evidence collected in this pass:

```text
FR/NFR headings in Specification: 21
exact REQUIREMENT claims in Pseudocode: 21
missing/extra requirement keys: none / none
SC IDs in Specification: 45
SC IDs claimed by Pseudocode: 45
SC IDs mentioned by Refinement: 45
missing/extra SC IDs: none / none
ADR IDs in ADR.md: 10
ADR IDs named in the eight Phase-2 downstream files: 0
check-growth-trace: exit 2 (check did not run; no contract-valid seed IDs)
```

This lens did not re-score individual stories, redesign algorithms, repeat provider research, or re-report the queued acceptance and architecture findings supplied in the work order. Naming equality proves joins only; it does not prove semantic implementation. Conversely, no runtime/build/test claim was inferred from planned SPARC prose.

## Exact project inputs at launch

Ordered SHA-256 manifest digest: `81dc343a6af8d013cec050261e73be0989068ba52f04227107123f96c15be975` (SHA-256 of the following ordered `sha256sum` manifest, including paths).

| Input | SHA-256 |
|---|---|
| `docs/Research_Findings.md` | `d06081113f90cb959df6083c52b5160eeb13ce4c127c5ba15f87a13a88a53ce7` |
| `docs/PRD.md` | `feb8c948e48db90300b59de6ebeb232569e235c24b976831db8684592b5d911b` |
| `docs/Solution_Strategy.md` | `845c56b03812c56f338db64ef24eec626cc5bde0346f69de3f5e9d53e2713f47` |
| `docs/Specification.md` | `fcfefeb2285784120c5614162f394d47ae895d6022eeca7371d8ed24f3a20fa1` |
| `docs/Pseudocode.md` | `1f53f758a978135b9ee29806c1544b5af1793dbaa22bbff4c3f43bbccb844ad7` |
| `docs/Architecture.md` | `84535d8d3e854041f9a76accea581a56cb4b13841dcc2ef5010e9f01687ffbf3` |
| `docs/Refinement.md` | `117df54fc7fa7bfda66ce576c756dfe0d23556097034ed0b801046c5ccf39c67` |
| `docs/Completion.md` | `59e64f3fcfab60333107eabe845bcbd82e2a7b4fb341d68907684008f53769fa` |
| `docs/Final_Summary.md` | `4831298d9e1e8df1f4e833fccd5eaa317bd089f5e5c48433fafb30e76b4f26f3` |
| `docs/C4_Diagrams.md` | `88d59e8c3ad9596ee8eb1c08827dc263c4a8bc5de47d7d2ca1f5d3ab955c1317` |
| `docs/ADR.md` | `ef72f365b4004ed8856687a4d1153967a8a3e52de5a3838bae47e66cca3a3bbc` |
| `docs/project-input.md` | `cdb8a9eb5a1d3f5a9f2dc6d00e25e242625952df9b7fb575c9d75b31ae58e231` |
| `docs/product-discovery-brief.md` | `a9c7fd15931f52f1c8ab4977431fc3876cde39b5d7f65ff2fa5916588c5e03b5` |
| `docs/discovery/cjm-design-brief.md` | `54fc2c4488781afe75f09651f73c38e40373155623b2535e28da0e15fbffe74c` |
| `README.md` | `7aeab42d12dc61adc8c6ce133c6a9d5fbfbbefc596a67d4d51335ca9bcebbe1e` |

Governing inputs were read from root `CLAUDE.md`, model-routing policy/telemetry, complexity routing, project-work companion, `/replicate` Phase 2, replicate-pipeline, and the complete requirements-validator skill/references. Their hashes are available from this run; the project-input manifest above is the source identity used for the verdict.

Status: completed
