# N5 support-access gate audit

RUN_ID: 20261028-n5-support-implementation
WORK_UNIT_ID: support-gate-audit
TRACE_PATH: /tmp/n5-support-gate-audit-20261028-trace.md
Scope: bounded read-only process audit; only the two explicitly requested /tmp audit artifacts are written. No product, toolkit, historical documentation, global configuration, indexes, secrets, installations, or production actions changed.
Source: /tmp/n5-acquisition-analytics-20261026 at 1f0befb75bd193c5282b273a6007f3997733cab5 (observed git rev-parse HEAD, exit 0).

## Decision

There is no currently released native selected-feature gate invocation. A normal `/feature support-access` legitimately scopes its five PLAN outputs, but it does not narrow the prescribed packaged checker's discovery. The installed package is 1.13.4; official npm latest is still 1.13.5, whose checker is byte-identical. Do not upgrade globally, patch the checker, reinterpret an aggregate nonzero exit as PASS, or extend the previous exception silently.

The smallest legitimate path is: finish concrete support-access PLAN documents; preserve the known unsuccessful aggregate baseline; prepare hash-bound selected-contour diagnostics without claiming stage advancement; then obtain one narrow additional owner exception covering support-access and its aggregate Phase 1/2/3 checker input scope. All content checks, review, tests and delivery boundaries stay mandatory. This is a real contract exception because of an explicit blocking rule, not a general requirement to reconfirm authorized implementation. Product research and PLAN preparation can continue immediately. Passing isolated diagnostics alone does not permit VALIDATE/IMPLEMENT advancement before the exception.

## Exact instruction basis

Paths below are relative to the source integration root unless absolute.

- `.claude/commands/feature.md:10` says `Run a 4-phase lifecycle on a single feature`; `:72-86` assigns the five outputs under `docs/features/<feature>/`. This bounds output location, not checker traversal.
- `.claude/commands/feature.md:97-105` requires the installed utility from the project root with `"${CLAUDE_PROJECT_DIR:-.}" --traceability` after all five documents but before the Phase 1 checkpoint/Phase 2.
- `.claude/commands/feature.md:108-112`: `Exit 0 is the only advancing result` (literal source uses backticks around 0); `never turn either non-zero status into a warning`. AUTO preserves the same semantics at `:236-239`.
- `.claude/commands/feature.md:140-145` requires `--report-revision --criterion-scenarios` with the same blocking exit semantics. `:202-208` requires `--completion`; nonzero is not downgraded. `:222-224` invokes feature-local review-contract checker with `<feature>` explicitly.
- `.claude/rules/feature-lifecycle.md:59-65` mandates strict PLAN → VALIDATE → IMPLEMENT → REVIEW; never skip or reorder. Its Phase 3 gate requires tests, lint and build; Phase 4 fixes blockers/high findings according to applicable command.
- `.claude/rules/complexity-router.md` makes risk decisive: new external calls/table/role/public route are L; changing role matrix or legal boundary is XL with owner plan checkpoint. The planner/coordinator must apply substantive ROUTE to actual support scope; this audit does not lower the tier or decide that admin/support changes avoid XL.
- `.claude/rules/project-work-companion-local.md`: preserve the calling command's stricter requirements and approval/checkpoint contracts; companion `Start and authority` says `Never infer authorization from this skill` and preserves existing approvals without inventing reapproval. Thus ordinary continuation does not cancel the gate rule or supply a new scope exception.
- `projects/05-podcast-clips-opus/docs/features/credits-cloudru-plan-gate.md:32-37` authorizes a source-bound snapshot of `только двух новых контуров: credit-packages и cloudru-provider-foundation`; `:45-48` records owner approval on 26 October and independent VALIDATE before code. support-access is absent. New implementation authorization/autonomy is not explicit replacement of these named input bounds.
- N5 `CLAUDE.md:234-239` requires native lifecycle and Phase 2; shared root toolkit applies. Its frozen-root-spec and cross-family evidence obligations remain unchanged.

## Current official vendor evidence

Read-only official registry request: https://registry.npmjs.org/@dzhechkov%2fp-replicator/latest . Retrieved 28 October 2026 around 00:11–00:13 UTC, twice; returned version 1.13.5, tarball https://registry.npmjs.org/@dzhechkov/p-replicator/-/p-replicator-1.13.5.tgz and integrity `sha512-Svpbi0CfWzrhzO3In4ztaZEJb6Ngdqgvie8V4SrezkfaQPjWIEy5hH7X1RbM/Jww6JWXeHSg1h6p9hoISGAE0Q==`. Registry repository points to https://github.com/djd1m/dz-harness/tree/main/packages/@dzhechkov/p-replicator . The web tool could not fetch registry/raw GitHub URLs; a bounded Python urllib GET of the official registry succeeded. No third-party source used.

No new package download was needed. The pre-existing `/tmp/n5-p-replicator-1.13.5/dzhechkov-p-replicator-1.13.5.tgz` has 1,219,752 bytes and its actual SHA512 matches current official registry integrity. It was inspected through Python tarfile in memory without extracting or executing content.

Installed checker, existing extracted 1.13.5 checker, and checker read directly from integrity-verified archive all have SHA256 `06e3dae22c533a81732b9870ae42d6b80b6e8419b3c90e11e1910e2a46888be8` (35,087 bytes). Latest official `/feature` template at archive path `package/templates/.claude/commands/feature.md` retains the same single-feature prose and aggregate blocking invocation; SHA256 `6908fa6c8ba770f829378a021d5f7e9a9bc79a15bdd67b278d8c6a765968b291`.

Installed `node .../bin/cli.js --version` exits 0 with 1.13.4. `--help` exits 0 and lists init/update/remove/list/doctor/verify plus force/dry-run/reset-settings/help/version. No CLI feature gate selector exists in this help. No init/update/install executed.

Checker `:653-680` accepts PROJECT_ROOT and only --traceability, --completion, --report-revision, --criterion-scenarios, --role-map-source and --project-role-map-source. Unknown arguments exit 2. Its `:742` sets DOCS_ROOT=$PROJECT_ROOT/docs; `:761-783` processes applicable project-root docs; `:786-845` visits all docs/features directories. Role-map flags select trusted role filenames, not features.

Observed diagnostic (not a full project gate rerun):

```
bash /root/.npm-global/lib/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh /tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus --feature support-access
```

Exit 2, before discovery:

```
NOT-ESTABLISHED unknown argument=--feature
Usage: check-pipeline-gaps.sh PROJECT_ROOT [--traceability] [--completion]
       [--report-revision] [--criterion-scenarios]
       [--role-map-source PATH] [--project-role-map-source PATH]

Exit 0: all checked ID sets are equal
Exit 1: a named content or traceability gap was established
Exit 2: a trustworthy comparison could not be established
```

The prior actual-project baseline is preserved and was not rerun here: exit 1, features33/gaps11/inconclusive30, as recorded in the existing owner-approved gate document and supplied by the coordinator. These are inherited results, not newly measured counts.

## Requested native-fullgate repair alternative: actual legacy source inventory

Follow-up from coordinator assessed honest aliases/mapping before any owner stop. Read the existing aggregate log directly (no rerun). Its 11 named root defects are DUPLICATE pseudocode FR-GROWTH-002, FR-INGEST-001, FR-INGEST-002, FR-LIMIT-001, FR-LIMIT-003, FR-LINK-001, FR-PARTNER-003, FR-RENDER-001, FR-RENDER-003, FR-RESULT-001 and FR-RESULT-002. Unique root sets are already 40/40; the failure is multiplicity, not absent alternate filenames. Mapping/aliases do not eliminate duplicates in the actual root Pseudocode.

A bounded Python read-only inventory inspected every Markdown file under all 30 legacy feature directories (excluding the three modern contours). For every one, files matching the checker's machine heading shape `### FR-/NFR-/AC-...-<number>`: zero; files with `### Algorithm:`: zero. This inventory is only source-format evidence, not a requirements validation pass. Illustrative actual files: foundation has 00_brief_codex.md and 05_completion.md; clip-card has 00_brief.md and 01_validate.md; payments has 01_plan.md and 02_validation.md. Their existing completion receipts also lack native `## Criterion coverage` tables. transcript-tolerance and subtitles-and-glossary each have only one Markdown file, 05_completion.md.

`docs/features/README.md:3-9` explicitly places historical requirements in Specification/addendum and feature mapping in REPRODUCE.md, and says features13/15 have only completion receipts. N5 CLAUDE.md:30-34 says features13–30 use central SPARC addenda. They are historical artifacts in a different contract, not 30 complete machine-key SPARC sets hidden behind alternative filenames.

Official checker safe_role_file at :208-226 refuses symlink path components; validate_role_target at :34-42 refuses ../ escapes. Its single parsed FEATURE role map is reused for every feature at :827-842, so it cannot adapt per feature to heterogeneous historical names. Byte-for-byte copied aliases would still contain no machine IDs/algorithms and process_contour at :267-269 emits no-declared-machine-ids when both sets are empty; mapping every old feature to central root files would additionally violate per-feature expected-slug rules (:179-193), and suppressing root docs changes scope. A hardlink or copied alias only changes the filename; it does not solve missing native content or root duplicate claims.

Therefore the native aggregate repair alternative is a substantive historical contract migration: derive/review feature-specific requirements/algorithms/AC mappings from real sources, resolve root duplicate claim semantics, provide source-bound historical reports and per-AC test evidence without pretending old validation judged a new spec revision. Such migration must not invent requirements or retroactively alter completion claims. It is materially broader than alias input repair and cannot be represented as a minimal normal support feature step. No historical migration was attempted or authorized by this audit. The narrow explicit selected-support scope exception remains the smallest proven route under the current native checker.

Actual added commands, all exit0: bounded reads of the prior aggregate log, legacy README/CLAUDE, checker extraction/safe-role logic; Python pathlib/re inventory of existing Markdown filenames and native heading/algorithm presence. No source files or checker results were changed. Exact source-format observations narrow the alternative; they do not claim that genuine migration is impossible if separately authorized.

## Concrete narrow exception to prepare (suggestion, not executed/approved)

For RUN_ID 20261028-n5-support-implementation and feature support-access only, permit the unchanged installed official check-pipeline-gaps.sh to evaluate a source-bound snapshot containing the real support-access five SPARC documents and reports, plus only the actual project-relative test files needed for criterion coverage. Supply the real shared-toolkit role-map sources through supported flags. Bind every copied file and the checker to SHA256, reject symlinks, capture source revision/dirty snapshot identity, verify originals and copies before/after each check, and preserve each exact exit/diagnostic. Keep the real-project aggregate failing baseline distinctly identified; selected PASS must always be labeled selected-contour evidence under this exception, never aggregate PASS. Do not change old documents, frozen specification, toolkit or checker.

The exception should cover scope of the same aggregate utility at Phase 1 (`--traceability`), Phase 2 (`--report-revision --criterion-scenarios`) and Phase 3 (`--completion`) so later identical discovery does not require repeated approval. It must retain independent requirements validation, bidirectional ID checks, per-AC scenarios, literal test references, native feature-local review contract, all applicable regression/typecheck/lint/build, mutation/concurrency/security checks, and authorized demo/E2E receipts. For completion, copy the actual referenced tests at identical relative paths; a names-only table or absent tests cannot pass. This exception does not authorize production changes, new paid calls/spend, credentials/access, external email delivery, Libredesk deployment, money changes or publication. Such authorization remains governed by the existing task boundaries.

Before any permission request, coordinator should make the five support documents and exact exception statement reviewable, report honest selected diagnostics if useful, and identify the one line of native blocking contract causing the request. The approval request is for altered checker input scope, not a second request to implement the already requested support feature.

A broad historical-doc migration or a real upstream compatibility enhancement could also solve this defect, but neither is the minimal support implementation. feature-adr's own confirmation and quality gates do not silently repeal /feature's active blocker. A sparse PROJECT_ROOT without an explicit exception, synthetic filenames to hide root docs, directory relocation, filtered output, or a custom gate engine would weaken the contract and are rejected.

## Execution ledger and limits

Observed successful commands (exit 0 unless noted): `cat CLAUDE.md`; `rg --files .claude docs`; root/source `git rev-parse HEAD`; reads of feature command/lifecycle/complexity/local companion and skill; selected N5 CLAUDE/old exception/audit and report-contract reads; package JSON/checker reads; `command -v p-replicator`; installed node CLI version/help; sha256sum installed and existing extracted checker; Python official registry GET; Python archive integrity and in-memory content inspection; numbered source excerpts. The first archive lookup for `package/templates/commands/feature.md` reported path absent without mutation; listing found correct `.claude` path and read it. The unsupported --feature diagnostic exited 2 as quoted. No checker full-project run, verify rerun, tests or implementation occurred.

Default sandbox exec failed before command execution with `bwrap: Can't mkdir .../.codex: Permission denied` (exit 1). Narrow approved require_escalated commands executed read-only source/tool inspection and the requested /tmp artifact writes. There was no automatic approval review rejection. No additional agents were spawned.

Profile: bounded read-only process audit. Actual runtime model identifier, token usage and monetary cost: null (not exposed by tools); not inferred. Exact launch timestamp unavailable; inspected at approximately 00:08–00:14 UTC, within 15-minute budget. E2E preflight: not_applicable, no E2E attempted. Report completion denotes the audit only; support PLAN/VALIDATE/IMPLEMENT/REVIEW gates are not claimed passed.

Status: completed
