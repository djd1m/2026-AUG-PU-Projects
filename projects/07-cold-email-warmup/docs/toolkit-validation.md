# Toolkit validation — N7

Source contracts a1c7ee1d, local generated artifacts in this commit. Vendor
`npm exec --yes --package=@dzhechkov/p-replicator@1.13.2 -- p-replicator verify`
ran in /tmp/n7-toolkit-verify-view and exited0. This disposable composed view
resolves original root pre-shipped files and N7 project overrides; it is NOT
standalone-project installation verification and was never used as an agent cwd.
No project/global hooks were registered. Root settings/hooks remain root-only;
project manifest lists those inherited capabilities. npm cache1.13.4 was not
used because root installed manifest is1.13.2. No shared toolkit changed.

Full output: telemetry/p-replicator/20261002T173314Z-n7-replicate-a1/evidence/toolkit-vendor-verify.txt.
Two advisory hints: Docker Compose intentionally belongs to Sol F01 scaffold;
view lacks insights carrier (actual N7 .claude/insights/index.md exists, link was
not included). Neither is a pre-shipped-contract failure. No backend claimed.

Generated P0/P1 agents/rules/skills/CLAUDE/guide/roadmap exist. Six MVP entries,
only F01 ready, remaining dependencies blocked. JSON parse and generated-only
placeholder/path scan passed. Context CLAUDE+guide approx2171.5chars/4 tokens;
this is template-budget approximation, never measured model usage. Shared vendor
on-demand templates retain their intentional placeholders and are not regenerated.
Generated templates preserve applicable section structure. DDD extras/MCP/P2
not selected. Shared source symlink target provenance in toolkit-inherited.json.

Limits: project requires full monorepo checkout, does not claim portable isolated
N7 clone. Domain code/tests/Compose unimplemented. Full build/security/runtime
and fresh reviewer gates remain required. Proceed /next F01 → /go F01.

## After F01 scaffold

The disposable view now includes actual N7 Compose and insights carrier. Vendor
1.13.2 verify rerun because these two previously missing artifacts changed: exit0,
All artifacts verified. Output toolkit-vendor-verify-final.txt under replicate
evidence. Settings/hooks remain root-only; no global or local hook registration.

## Final F06 documentation handoff — 2026-10-03

Same installed vendor1.13.2 and disposable composed view were verified after the
completed implementation/docs refresh. Vendor output: **All artifacts verified**.
[Full output](telemetry/features/20261003T023900Z-f06/toolkit-final-verify.txt).
The shell wrapper exited0; the vendor exit was not separately captured before
tail (raw vendor summary is the direct success evidence). No root settings/hooks
were registered or changed. This still verifies the composed monorepo view, not
a portable single-project installation. Earlier paragraphs are historical stage
records; the current local implementation is accepted in Completion.md.
