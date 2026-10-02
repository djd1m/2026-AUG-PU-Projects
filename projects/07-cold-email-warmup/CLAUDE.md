# Project: N7 — Почтовый прогрев

## Overview
Локальный MVP SMTP/IMAP warmup и персонализированных цепочек для небольшой B2B команды.
Canonical product/architecture docs: docs/. Validated design: docs/validation-report.md.
Backend ещё строится; готовность определяют тесты и review, а не наличие документа.

## Problem & Solution
Команде нужны общий лимит, отдельное согласие и надёжная остановка после ответа.
Общий пул начинается с добровольной когорты курса; без пары показываем waiting.
Репутация unknown до проверяемых наблюдений. AI replies, CRM и покупка доменов исключены.

## Architecture
Distributed monolith: web/API и отдельный worker используют PostgreSQL16, очередь
и транзакции. Docker Compose в отдельной N7 сети; БД без host port. Разделение
src/auth, src/mailboxes, src/dispatch, src/replies, src/billing, src/growth и web.
Схема и алгоритмы: docs/Architecture.md, docs/Pseudocode.md.

## Tech Stack
Node22, TypeScript, native HTTP, pg, Argon2id, Nodemailer, ImapFlow. UI — доступная
серверная оболочка и TypeScript по CJM A. Browser только общий Docker Playwright1.63.0.
Версии/лицензии зависимостей фиксируются Sol и интегратором в первом lockfile.

## Key Algorithms
- register/login/logout: bounded Argon2id, durable session revocation, tenant predicates.
- reserve/submit: quota reservation; global advisory lock(7,1) first for ALL stop writers.
- final claimed→submitting commit: last current-state check, irreversible in-flight boundary.
- ingestReply: observation identity separate from unique semantic mailbox/enrollment effect.
- reconcilePayment: immutable intent, independent canonical local provider state, single grant.

## Security Rules
Specification.md safety-v1 is authoritative. Unchecked separate pool/campaign consent;
no sending on save. Live SMTP, real charge and deployment remain disabled.
ADR001 explicitly uses SERVER AEAD plus external runtime key for background workers;
generic client-only template guidance does not apply. Never expose credentials.
Peer consent discloses sender/header/test body; private campaign/contact/credential APIs tenant-scoped.
Origin/session/tenant checks; 8–200 Unicode password chars and<=800bytes; Argon2id exact
m65536/t3/p1 salt16/output32; at most2 active KDF, no queue. Unknown delivery never blind-retries.

## Parallel Execution Strategy
Use independent bounded units only within global owner schedule. Each writer gets isolated
worktree and exact paths; root manifests stay untouched, N7 coordinator owns project lock.
Every parallel unit delivers a FILE, not a reply: unique WORK_UNIT_ID, absolute TRACE_PATH,
preallocated serialized launch and source digest, substantive final Status: completed/failed.
Run node ../../.claude/hooks/check-swarm-receipts.cjs on bound manifest before aggregation.
One implementation → fresh independent review → confirmed corrections only.

## Swarm Agents
| Scenario | Model roles | Bound |
|---|---|---|
| Planning/architecture | Astra high | exact feature scope |
| Product code/tests/UI | Sol6.1 high | 20minutes per attempt |
| Independent review | fresh Astra high | 8minutes per bounded slice |
Actual models require host evidence. Never change global configuration. Parent can lend its
lane to one CLI worker while monitoring only; max4 actual working units across projects.

## Git Workflow
Commit early per logical change, Russian conventional messages, no Co-Authored-By.
Push origin feature/07-cold-email-warmup. PR target claude/install-npm-packages-n7l3m5;
main does not exist and must not be created. No shared root/toolkit/N6 mutations.

## Available Agents
| Agent | Purpose |
|---|---|
| planner | source-bound feature/algorithm decomposition |
| architect | ADR and transaction boundary review |
| code-reviewer | independent current-spec acceptance and security review |

## Available Skills
project-context, coding-standards, testing-patterns, security-patterns, feature-navigator
are N7-specific. sparc-prd-mini, explore, goap-research-ed25519, problem-solver-enhanced,
requirements-validator and brutal-honesty-review are inherited root capabilities.
Project-work-companion root skill applies at prepare/resume/E2E/handoff.

## Quick Commands
/start: scaffold from actual docs; /next: roadmap; /go feature-id: routed implementation;
/feature: plan→validate→implement→review; /plan: bounded plan; /myinsights: knowledge;
/docs: bilingual guides; /deploy: separate deployment checkpoint. Commands inherited unchanged.

## Development Insights
Read .claude/insights/index.md before debugging and use dz recall --project . --no-semantic.
Teach only public project patterns; never secrets. Global Claude learned source unavailable
in initial discovery; do not invent imported memories. Root hook registration is unchanged.

## Feature Development Lifecycle
PLAN uses validated project clauses and delta feature spec under docs/features/;
VALIDATE retains exact scenario references; IMPLEMENT is Sol-authored; REVIEW is fresh Astra.
XL owner approval OWN-N7-002 covers this plan/team/roles/skills and autonomous continuation.
It does not authorize live email, charge or deployment. Runtime tests remain mandatory.

## Feature Roadmap
.claude/feature-roadmap.json is current state. /next selects dependency-ready MVP work;
mark done only with accepted tests/review. Root SessionStart/Stop hooks remain root-only;
this Codex host records roadmap boundaries explicitly, no automatic-hook claim.

## Implementation Plans
Store Markdown product/architecture plans in docs/plans/ and docs/features/.
Canonical Specification/Pseudocode/ADR stay authoritative. Do not create duplicate canon.

## Automation Commands
/run → /start → /next → /go → /feature (SPARC; no DDD enterprise artifacts required).
/run mvp continues all MVP dependencies. /docs generates README language guides after runtime.
Keep bounded attempts and progress pushes; do not end work at intermediate package checkpoints.

## Resources
Read docs/{PRD,Specification,Pseudocode,Architecture,Refinement,Completion,ADR}.md,
docs/reuse-inventory.md, docs/decisions-owner.md and docs/pipeline-walkthrough.md.
