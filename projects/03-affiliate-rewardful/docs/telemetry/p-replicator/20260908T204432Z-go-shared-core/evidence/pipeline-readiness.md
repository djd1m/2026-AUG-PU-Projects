# N3 pipeline readiness

- WORK_UNIT_ID: `pipeline-readiness`; RUN_ID: `20260908T203242Z-four-prds`.
- Scope: read-only readiness inspection of `projects/03-affiliate-rewardful`; no repository files, dependencies, network state, or containers changed.
- Repo baseline: `ed33f3cd757260abfa97c0b6aa93dd3a9428ff4b`; project docs are already dirty (not attributed to this unit).
- Profile: `compact-quality-first-v2`; actual model/effort and usage: `null` (host exposes no confirming metadata/counters).

## Resolved checker and provenance

- Candidate source: `/home/dz-projects-2026/dz-harness-hub/packages/@dzhechkov/p-replicator`, package `@dzhechkov/p-replicator@1.13.2`, source commit `902489a62fe5ba400cfa4ef2a91fda112969c4df` (2026-09-08T19:40:12Z).
- Checker: `scripts/check-pipeline-gaps.sh`, declared in `files[]`; SHA-256 `06e3dae22c533a81732b9870ae42d6b80b6e8419b3c90e11e1910e2a46888be8`. `package.json` SHA-256 `dbf458cd18ad5895d66fe15b32ed204c24c1b6e4bb4b56be6ffa20cff6bf72a7`.
- Root toolkit is not an installed Node package: no root `package.json`/lockfile and no target-project manifest. Current toolkit provenance `.claude/.proven-config-version` is `sha256:6141a8ea990c5063b77e090ae8f37f9c539d8aa8f58dcceb30f3a82f97e57319`; `.claude/toolkit-manifest.json` SHA-256 `49910e16f74bf6d28934024f444110ea4a84e75ef885d466b638e71bba2d77ee`.

## Required minimal harness (not performed)

Registry path, if available: from `projects/03-affiliate-rewardful`, create a manifest if absent (`npm init --yes`), then `npm install --save-dev --save-exact --ignore-scripts --no-audit --no-fund @dzhechkov/p-replicator@1.13.2`.

Offline/local path: run `npm pack --json --pack-destination /tmp/p-replicator-1.13.2` with cwd set to the candidate package; retain the emitted tarball and its SHA-256; from the project run `npm init --yes` if needed, then `npm install --save-dev --save-exact --ignore-scripts --no-audit --no-fund /tmp/p-replicator-1.13.2/<emitted>.tgz`. Commit the resulting `package.json` and lockfile, and retain/copy the tarball to a project-controlled immutable location before another machine must install it. `npm view ... --offline` returned `ENOTCACHED`, so registry publication was not established.

Resolve at each gate from the installed project package:
`CHECK_PIPELINE_GAPS="$(node -p "require.resolve('@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh')")" || exit 2`.

## Document contract and invocations

- Project-local role-map sources must exist as regular readable files: `.claude/commands/feature.md`, exact heading `### Phase 1 document role map`; `.claude/skills/sparc-prd-mini/SKILL.md`, exact heading `### Project-level default`. Each has one ` ```yaml` block containing `DOCUMENT_ROLE_MAP:` and exactly once each of `specification`, `pseudocode`, `architecture`, `refinement`, `completion`; values are non-empty relative non-symlink paths with no `..`.
- Feature map targets must be `01_specification.md`, `02_pseudocode.md`, `03_architecture.md`, `04_refinement.md`, `05_completion.md` under `docs/features/<feature>/`. Default project targets are `Specification.md`, `Pseudocode.md`, `Architecture.md`, `Refinement.md`, `Completion.md` under `docs/`. Feature slugs match `^[a-z0-9]+(-[a-z0-9]+)*$`.
- Traceability syntax: un-fenced column-zero headings `### FR|NFR|AC-<slug>-<n>` in specification; each pseudo algorithm begins `### Algorithm:` and has exact column-zero `REQUIREMENT: \`FR|NFR|AC-<slug>-<n>\`` lines. The checker requires equal, unique bidirectional ID sets.
- Phase 1: `bash "$CHECK_PIPELINE_GAPS" "${CLAUDE_PROJECT_DIR:-.}" --traceability`.
- Phase 2 `validation-report.md`: first 20 lines contain exactly `Spec revision: sha256:<64 lowercase hex>` equal to the mapped spec hash, plus `## Criterion scenarios` then exact table header `| Criterion | Scenario |`; run `bash "$CHECK_PIPELINE_GAPS" "${CLAUDE_PROJECT_DIR:-.}" --report-revision --criterion-scenarios`.
- Phase 3 completion target: `## Criterion coverage` then exact header `| Criterion | Test file | Test title |`; run `bash "$CHECK_PIPELINE_GAPS" "${CLAUDE_PROJECT_DIR:-.}" --completion`. Exit 0 advances; exit 1 named gap; exit 2 not established and blocks.

## Observed blockers and gate result

The target lacks `package.json`, `.claude/commands/feature.md`, `.claude/skills/sparc-prd-mini/SKILL.md`, `docs/features/`, all five default SPARC targets, and `validation-report.md`. Direct candidate execution with all four modes returned exit 2: both required role-map sources missing; every verdict is `NOT-ESTABLISHED`. This is expected fail-closed behavior, not a passed empty gate. No applicable project/feature contour exists yet.

Status: completed
