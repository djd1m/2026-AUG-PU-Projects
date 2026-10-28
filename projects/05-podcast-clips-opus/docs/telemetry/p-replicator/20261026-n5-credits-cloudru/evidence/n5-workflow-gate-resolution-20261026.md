# N5 Phase 1 gate input audit

Scope: bounded read-only process audit; no product implementation, historical document edits, bookkeeping edits, checker modifications, or product validation. This requested report is the only written artifact.

Decision: no supported feature-local invocation preserves the mandatory actual-project Phase 1 gate. The two new contours can have valid individual traceability while the required aggregate result remains failing. Do not declare Phase 1 or Phase 2 passed from selected-contour output.

Evidence inspected directly:

- [Canonical /feature gate](/tmp/n5-acquisition-analytics-20261026/.claude/commands/feature.md:96): run installed checker from the project root with `"${CLAUDE_PROJECT_DIR:-.}" --traceability`. Lines 108–112 require: “Exit `0` is the only advancing result” and “never turn either non-zero status into a warning.”
- [Installed checker supported arguments](/root/.npm-global/lib/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh:662): `--traceability`, `--completion`, `--report-revision`, `--criterion-scenarios`, `--role-map-source`, `--project-role-map-source`; unknown arguments exit 2. No feature selector, exclusion, baseline or legacy-compatibility option exists. Downloaded 1.13.5 has the same CLI and discovery contract.
- [Installed discovery](/root/.npm-global/lib/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh:744): docs root is unconditionally `$PROJECT_ROOT/docs`; existing root specification/pseudocode are checked (lines 764–768); every directory under `docs/features/*` is checked (lines 800–828). Role-map source options change role filenames, not discovery scope.
- [Lifecycle governance](/tmp/n5-acquisition-analytics-20261026/.claude/rules/feature-lifecycle.md:59): strict PLAN → VALIDATE → IMPLEMENT → REVIEW, never skip or reorder.
- [N5 instructions](/tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus/CLAUDE.md:44): root specification is frozen; editing requires revision rebinding and traceability recalculation. Shared toolkit is explicitly at repository root.
- [Alternative route](/tmp/n5-acquisition-analytics-20261026/.claude/commands/feature-adr.md:19): feature-adr requires its own complexity routing and confirmation of tier before active steps. It does not grant permission to override a failed mandatory /feature gate.

Input repair versus scope change:

1. Passing the actual shared-toolkit source documents via the two supported role-map options is a legitimate input repair: those sources define the correct roles without altering documents or discovery.
2. Setting PROJECT_ROOT or CLAUDE_PROJECT_DIR to a sparse export containing only the new feature changes the discovery universe. Hash-bound copies can prove selected-contour traceability honestly, but their successful exit cannot supersede the actual project's failed gate. Calling such a copy the project root to advance would weaken the prescribed check.
3. Suppressing the project contour via invented filename maps, relocating old feature directories, replacing history with empty artifacts, or filtering checker output would likewise alter the required contract. Do not do it.
4. Repairing historical docs is technically capable of satisfying the aggregate checker, but that is a separate broad migration, prohibited by this audit's scope and risky against the frozen specification. Do not infer authorization from the request for the two new product features.

Smallest legitimate next step: retain actual aggregate diagnostics and request a narrow, explicit owner exception permitting source-bound selected-new-contour evidence to replace this particular aggregate Phase 1 gate, with all subsequent requirements validation, tests, integration and review gates still required. This is an explicit exception, not a passing aggregate result. Alternatively obtain authorization for a real harness compatibility change or historical-document migration. A switch to feature-adr needs its own announced route and applicable confirmation; it is not a silent workaround.

The necessity for an exception comes from the exact /feature command rule above, not a general approval policy or an inferred safety precaution. Existing authorization to implement does not override its explicit nonzero blocking semantics. Product-independent research and preparation may continue without advancing the blocked phase.

Coordinator-provided results (not rerun by this audit): new credit contour 21/21 keys and 15 scenarios; new Cloud.ru contour 14/14 keys and 6 scenarios; actual aggregate exit 1, 32 features, 11 gaps, 30 inconclusive. This audit did not independently establish those counts or any product gate result.

Actual commands executed: `sed -n '1,260p' .claude/commands/feature.md`; `rg -n` against command/lifecycle/checker sources; `sed -n '1,200p'` and `sed -n '645,850p' /tmp/n5-p-replicator-1.13.5/check-pipeline-gaps.sh`; `sed -n '1,19p'` and `nl -ba` excerpts of installed checker; reads of `.claude/rules/feature-lifecycle.md`, `.claude/rules/p-replicator-known-gaps.md`, `.claude/commands/feature-adr.md`, and N5 CLAUDE.md. Initial sandboxed shell reads failed before execution with bwrap .codex permission error; narrow read-only escalation succeeded. No automatic approval review rejection occurred. No checker or tests were executed in this audit.

Actual model: null (not exposed). Token usage/cost: null (not exposed). Bounded audit completed within the requested attempt window; precise wall-clock measurement unavailable.

Status: completed
