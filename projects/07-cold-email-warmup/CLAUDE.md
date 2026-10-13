# Project: N7 — Почтовый прогрев

## Overview
Принятый локальный MVP SMTP/IMAP warmup и цепочек; expanded MVP утверждён OWN-N7-005 и реализуется по плану в docs/plans/expanded-mvp-plan.md.
Canonical product/architecture docs: docs/. Validated design: docs/validation-report.md.
Локальный backend и кабинет приняты; source-bound status/PR: docs/Completion.md.

## Problem & Solution
Команде нужны общий лимит, отдельное согласие и надёжная остановка после ответа.
Общий пул начинается с добровольной когорты курса; без пары показываем waiting.
Репутация unknown до проверяемых наблюдений. OWN-N7-004 включает AI replies,
unlimited connected mailboxes и живой автопрогрев в expanded MVP. CRM и покупка
доменов исключены. F07–F10 приняты на локальных протокольных fixtures и source-bound проверках; F11–F14 и
отдельно разрешаемый F15 live-пилот ещё не завершены. Публичный кабинет пока использует
прежний F08 preview; он не подтверждает развёртывание принятого F10 или кандидатов F11.

## Architecture
Distributed monolith: web/API и отдельный worker используют PostgreSQL16, очередь
и транзакции. Docker Compose в отдельной N7 сети; БД без host port. Разделение
src/auth, src/mailboxes, src/dispatch, src/replies, src/billing, src/growth и web.
Схема и алгоритмы: docs/Architecture.md, docs/Pseudocode.md.

## Tech Stack
Node22, TypeScript, native HTTP, pg, Argon2id; F08 использует native TLS для SMTP/IMAP
диагностики подключения и AUTH. F09 добавляет native SMTP и read-only UID IMAP с отдельной transport authority; внешние подключения остаются отключены. UI — доступная
серверная оболочка и TypeScript по CJM A. Browser только общий Docker Playwright1.63.0.
Версии закреплены в package-lock.json; внутреннее reuse описано в docs/reuse-inventory.md.

## Key Algorithms
- register/login/logout: bounded Argon2id, durable session revocation, tenant predicates.
- reserve/submit: quota reservation; global advisory lock(7,1) first for ALL stop writers.
- final claimed→submitting commit: last current-state check, irreversible in-flight boundary.
- ingestReply: observation identity separate from unique semantic mailbox/enrollment effect.
- reconcilePayment: immutable intent, independent canonical local provider state, single grant.

## Security Rules
Specification.md safety-v1 is authoritative. Unchecked separate pool/campaign consent;
no sending on save. Live SMTP, product OpenAI calls and real charge remain disabled.
Owner-authorized existing F08 preview publication is documented in docs/deployment-checkpoint.md;
other deployment changes require their own gate.
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
| Planning/architecture | Sol6.1 high | exact feature scope |
| Product code/tests/UI | Sol6.1 medium | 20minutes per attempt |
| Independent review | fresh Sol6.1 high, fork_turns=none | 8minutes per bounded slice |
Active profile `model-routing-econom` (OWN-N7-006) overrides the former Astra/high and Sol/high split for new stages. Reviewer receives the approved planner packet and frozen source/tests, without author history or reasoning. Existing A11 HIGH and historical records remain unchanged.
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
VALIDATE retains exact scenario references; IMPLEMENT is Sol6.1/medium; REVIEW is fresh Sol6.1/high with planner-only context.
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
