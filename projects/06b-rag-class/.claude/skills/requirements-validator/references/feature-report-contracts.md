# Feature report contracts (`/feature`, Phases 2–4)

Byte-level formats that the packaged gates enforce. Read this when WRITING one of the three reports;
the gates are the machine half: `scripts/check-pipeline-gaps.sh` (`--report-revision`,
`--criterion-scenarios`, `--completion`) and `.claude/hooks/check-review-contract.cjs`. Exit codes
everywhere: `0` pass · `1` named gap(s), one line each · `2` could not establish (missing, unreadable,
symlinked or malformed input). Neither non-zero status is ever a warning.

## Shared keys

- **AC ids** are `### AC-<slug>-<n>` headings in `docs/features/<f>/01_specification.md`
  (`(FR|NFR|AC)-[A-Za-z0-9]+(-[A-Za-z0-9]+)*-[0-9]+`; fenced code blocks are ignored). FR/NFR stay under
  the Phase 1 specification↔pseudocode gate; the three contracts below key on **AC-** ids only.
- **Spec revision line** — `Spec revision: sha256:<64 lowercase hex>`, the SHA-256 of the BYTES of
  `01_specification.md` (`sha256sum docs/features/<f>/01_specification.md`), within the first 20 lines
  of `validation-report.md` and of `review-report.md`. A report is bound to the revision it judged;
  editing the specification afterwards makes the report stale by construction.

## validation-report.md (Phase 2)

```markdown
# Requirements Testability Analysis
Spec revision: sha256:<digest of 01_specification.md>

## Criterion scenarios
| Criterion | Scenario |
|-----------|----------|
| AC-example-1 | Successful example flow |
```

`## Criterion scenarios` maps every AC id to the named BDD scenario that covers it — the artifact the
`Traceability` blocking floor keys on (`references/scoring-system.md`). It is NOT the algorithm-level
`## Scenario Coverage` block that `sparc-prd-mini` writes into `02_pseudocode.md`. An AC id without a
row, an undeclared id, or an empty scenario cell is a named gap; a missing table cannot be established.

## 05_completion.md (Phase 3)

```markdown
## Criterion coverage
| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-example-1 | tests/example.test.js | rejects an invalid request |
```

One row per AC id. `Test file` is relative to the project root and must be a regular file inside it
(absolute, `..`-escaping and symlinked paths are refused); `Test title` must occur verbatim in that
file. Both directions compare: an AC id without a row and a row whose id is not in the specification
are gaps. A table of names is not evidence — the gate opens the file.

## review-report.md (Phase 4)

```markdown
Reviewer family: claude|codex|human|unknown
Spec revision: sha256:<64 lowercase hex>

## Spec conformance
| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| AC-example-1 | met | tests/example.test.js — rejects an invalid request |
```

Input contract: the review receives `01_specification.md` and `validation-report.md`; a review that
was not given the specification is incomplete by construction and must say so instead of grading code
quality alone. Output contract: both header lines within the first 20 lines (`Reviewer family:` is a
DISCLOSURE — the package refuses silence but cannot verify which family reviewed); every AC id exactly
once in `## Spec conformance`; `Verdict` is exactly `met`, `not met` or `unverifiable` (lowercase);
a `met` or `not met` row carries non-empty evidence; a `not met` row ideally carries a reproducer.
