# N7 development guide

## Setup
Read CLAUDE.md, docs/Specification.md and local rules. Toolkit shared components
are symlinks within this repository, never edit through them. Project artifacts
are regular files under N7. Initial manifest inherits root installation provenance.
Backend setup/build commands are supplied and executed by F01; no working server
is implied before its accepted receipt. Docker uses own network/volume,DB unexposed.

## Full lifecycle
/start scaffolds only actual Architecture components, including PostgreSQL migration
and explicit fixture seed; it does not bypass acceptance. /next selects a ready MVP;
/go routes risk and executes PLAN→VALIDATE→IMPLEMENT→REVIEW. /plan persists bounded
work; /feature uses SPARC delta referencing canonical projectdocs. Every worker has
WORK_UNIT_ID, absolute TRACE_PATH, prelaunch digest and exact source. Verify terminal
receipts before integration. Sol6.1high writes product code/tests; freshAstra reviews.

## Commands and agents
/start, /next, /go, /run, /feature, /plan, /myinsights, /docs, /deploy are inherited.
planner decomposes algorithms; architect checks ADRs; code-reviewer checks all scoped
AC from current spec. /test is not a shipped command and is not advertised.

## Feature Workflow
/next → highest dependency-ready feature → /go feature-id → checks/fresh review →
/next feature-id marks accepted work done and unblocks dependencies. Code existence
alone never means done. Root hooks remain root-only; Codex updates explicitly.

## Autonomous Development
/run mvp continues the six roadmap entries under OWN-N7-002. No repeated XL approval
within the approved plan. All product/architecture decisions go to docs/ Markdown.
One bounded implementation pass, independent review, concrete fixes. Push Russian
commits frequently; user gets artifacts throughout. No optional polish after gates.

## Test
Refinement.md requires unit/realPostgreSQL/localprotocol/browser layers, full build,
license/security scan and consent/quota/tenant mutations. CPU2perrunner, heavy suites
serialized with other projects. Browser only existing codex-ui-playwright1.63.0;
read companion and preflight source/build/environment before appE2E. Failed/incomplete
checks remain named, do not convert source-look or prototype checks into runtime proof.

## Deploy and delivery
No live email, charge, proxy edit or deployment without applicable authorization.
Prepare concrete reviewable deployment first. PR targets claude/install-npm-packages-n7l3m5,
never create main. Final report states actualmodels/checks/source/time/usage gaps.
