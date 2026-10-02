# Project: RoomKind — InteriorAI redesign

## Overview
N8 turns a private room photo into a styled redesign while preserving geometry. Selected CJM A supports upload→style→job→comparison→gallery→package/share. All product/architecture Markdown lives in docs/. Repository toolkit lives at REPO_ROOT/.claude; never overwrite it or another project's files.

## Problem & Solution
Owners/renters need to visualize their own room. Use actual Stable Diffusion plus ControlNet-depth, with separate private result viewing and operator-verified public examples. Image fixtures demonstrate software flow only. No furniture catalog,3D,collaboration,subscriptions,partner payouts or automatic invitations.

## Architecture
Node web/API serves static UI, PostgreSQL holds accounts/ledger/queue, private volume stores media, Python worker performs depth-conditioned inference. Provider hosted checkout keeps card entry off this app. Canonical field names/lock order are docs/Pseudocode.md; docs/Architecture.md owns component boundaries. Do not invent successful runtime evidence.

## Tech Stack
Node22 ESM/node:http, pg, bcrypt, sharp; PostgreSQL16; native HTML/CSS/JS; Python/psycopg/torch/transformers/diffusers/Pillow; isolated Docker Compose. Pin dependencies and inspect security advisories. No framework required. GPU weights are separately pinned in docs/model-provenance-candidates.md and require verified loading; never silently fall back.

## Key Algorithms
- register/login: canonical email,32random-byte session, HMAC-only DB token, bcrypt, one trial ledger.
- reserveJob: stable idempotency, ordered locks, credit+first-attempt ticket+job in one transaction; queued60s/job360s.
- settlePayment: authenticated provider GET, account→intent serialization, one purchase ledger; monotonic refund hold.
- runAttempt: first/retry/currentUTC ticket, lease30s/heartbeat10s/fence, fixed180s attempt bounded by job deadline.
- exportComposite: owner/consent/quality/hold recheck at final delivery, AI label always and effective entitlement controls RoomKind badge.

## Security Rules
Follow41 AC in docs/Specification.md and their named scenarios. Default private, EXIF stripped, UUID paths, no external upload URL, two-account404 boundaries. Held account cannot reserve/start/retry or receive badge-free cached output. Secrets only server runtime/ignored env; user explicitly forbids browser keys and printed values, overriding generic template client-key advice. No live payment, mail, deployment, GPU rental or external spend in current plan. Budget/config missing fails closed.

## Parallel Execution Strategy
Owner explicitly authorized separate swarms. Each independent work unit gets bounded files/AC/checks/time/stop, unique WORK_UNIT_ID and absolute TRACE_PATH, absent before launch. Substantive receipt ends exactly Status: completed or Status: failed and is atomically installed. Validate unique regular non-symlink source/launch-bound receipt before integration; silence and exit0 alone do not prove success. Use REPO_ROOT/.claude/hooks/check-swarm-receipts.cjs where its manifest applies. Shared4-slot limit includes CLI workers; coordinate capacity with root. One writer per isolated worktree. One project heavy build at a time; CPU2. Tests may run independently only when resource safe.

## Swarm Agents
| Scenario | Roles | Dispatch boundary |
|---|---|---|
| Feature | Astra planner, Sol6.1high coder, fresh Astra reviewer | Sequential bounded writer/review, independent tasks only when global capacity free |
| Correction | One writer then affected independent review | Only confirmed findings, no optional polish |
| Documentation | Coordinator with independent delta review | No product code by planner |

## Git Workflow
Commit logical steps in Russian using type(08): description, no CoAuthoredBy. Main product branch feature/08-interior-ai; PR base claude/install-npm-packages-n7l3m5. Do not create main or invoke /go --feature-branches (its main prerequisite is absent). Only code integration owner modifies N8 manifests/lockfiles. Never commit .env, raw agent logs/full prompts, model weights or user media.

## Available Agents
| Agent | Purpose | Requested model |
|---|---|---|
| planner | Map AC to bounded feature/file/check plan | gpt-6-astra high |
| architect | Preserve documented transaction/model boundaries | gpt-6-astra high |
| code-reviewer | Fresh independent finding-based review | gpt-6-astra high |
Product code executor: gpt-6.1-sol high. Requested names are routing instructions, never proof of actual host model; provider-resolved metadata/usage unknown stays null.

## Available Skills
Local project-context, coding-standards, testing-patterns, security-patterns, feature-navigator. Shared repository lifecycle: sparc-prd-mini, explore, goap-research-ed25519, problem-solver-enhanced, requirements-validator, brutal-honesty-review. Shared project-work-companion governs preparation/read-only E2E preflight/handoff. Read full applicable modules, not keyword-triggered global copies.

## Quick Commands
/start (bootstrap using docs/DEVELOPMENT_GUIDE.md); /myinsights; /feature; /plan; /next; /go; /run; /docs; /deploy. These are root shipped instruction commands, not an installed scheduler. /deploy requires separate applicable external-effects authorization. No /test command is installed or advertised; use actual package scripts after implementation.

## Development Insights
Index: docs/myinsights/1nsights.md, details under docs/myinsights/details/. Before debugging rg the error string and read only matching detail. /myinsights records reproducible lessons, no credentials/full prompts. dz teach/recall are supported; standalone dz store is absent on0.8.35. Project .dz stays ignored.

## Feature Development Lifecycle
PLAN→VALIDATE→IMPLEMENT→REVIEW using root /feature AUTO. Plan references existing SPARC41AC, avoid rewriting it for every small unit. Semantic score≥70 with no artifact floor plus confirmed design closure; implement only scoped accepted plan; fresh independent review then specific fixes. Do not weaken risk gates to save time. GPU quality and real provider acceptance remain distinct from fixture tests. No repeat owner XL checkpoint within docs/decisions-owner.md autonomy boundaries.

## Feature Roadmap
.claude/feature-roadmap.json is status authority, schema at REPO_ROOT/.claude/commands/next.md. /next chooses priority and dependencies, /next id marks done only with actual required checks/receipt. SessionStart hook is shared and not guaranteed active in native CLI; explicitly read roadmap here. Do not claim automatic status injection.

## Implementation Plans
Persist plans under docs/plans/ and feature evidence under docs/features/. /plan creates bounded goal/tasks/files/dependencies/risks; /go invokes the appropriate lifecycle. All product documents remain Markdown in docs/. Working source and telemetry stay N8.

## Automation Commands
/go feature selects /feature for financial/private-data scope regardless numerical size heuristic. /run mvp or /run all loops /next→/go within authorized scope; pending GPU gate stays visible while independent features proceed. /docs writes bilingual documentation under docs/README/. These commands do not authorize deployment/spend or install hooks.

## Resources
Read docs/PRD.md, Specification.md, Pseudocode.md, Architecture.md, Refinement.md, Completion.md, decisions-owner.md, reuse-inventory.md, validation-report.md, pipeline-walkthrough.md and docs/DEVELOPMENT_GUIDE.md. Telemetry run n8-20261002-1740; update before stage/delegation/retry/model switch/end. Actualmodel/cost unknown null; no measurement guesses.
