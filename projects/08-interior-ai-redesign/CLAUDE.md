# Project: N8 — помощник для ремонта

## Overview

Первый клиент делает ремонт для себя.
Канон: обмер/план + референсы → оформление → согласование → товары → бюджет → пересмотр.
Владелец выбрал CJM A; ожидание отдельного approval отменено.
Источники: docs/project-input.md и docs/PRD.md.
Полная реализация разрешена автономно в пределах согласованного времени.
Локальный ручной путь работает без внешних ключей.
Документ не является доказательством реализации.

## Problem & Solution

Картинка не подтверждает размеры, наличие товаров или полную цену ремонта.
Измеренная основа immutable; варианты и воспроизводимые сметы хранятся отдельно.
Неизвестная цена/площадь/доставка не превращается в ноль.
GPU/ControlNet и прежние запреты на товары/3D заменены вводом владельца.
См. docs/Solution_Strategy.md.

## Architecture

Web, worker, private PostgreSQL, private asset volume.
Domain: identity/space/design/procurement/billing/sharing с public subpaths.
packages/db реализует repositories/transactions.
packages/adapters реализует filesystem/provider/decoder ports.
Composition root связывает concrete зависимости; domain их не импортирует.
Worker применяет те же config/guards.
Не добавлять Redis/GPU/микросервисы без конкретного принятого требования.
Не импортировать runtime код соседних проектов.
См. docs/Architecture.md и docs/C4_Diagrams.md.

## Tech Stack

Next15 compatible line, React19, TypeScript strict, Node24.
PostgreSQL16+, pg, parameterized SQL.
Babylon viewer, Khronos glTF Validator, sharp, Decimal.js.
Vitest и Playwright, exact audited lock.
Reuse donor contracts, не устаревшие locks.
Аудит реальной установки обязателен.

## Key Algorithms

Authenticate: hash вне transaction; session expiry/revoked/active.
CalibrateSpace: immutable geometry/calibration, user confirmation.
ValidateAndRenderScene: known dimensions, no shell transform/code/URL.
SubmitAndRunProposal: replay first, durable caps/holds/fenced dispatch.
CalculateBudget: exact packaging, complete snapshot, unknown/phases.
ApplyVerifiedPayment: provider proof before ledger, partial-refund hold.
ExportAndShare: server provenance, watermark, private image/revoke.
ExportShoppingList: owner CSV, formula text inert.
Читать docs/Pseudocode.md, не заменять алгоритмы памятью.

## Security Rules

Bcrypt password≤72 UTF-8 bytes, явный отказ длиннее.
HttpOnly session; exact Origin на mutation, missing/foreign rejected.
Pre-body guard считает rate и проверяет actor/owner без body consumption.
JSON/upload читает только свой bounded handler после guard.
Каждый read/write/file проверяет account+project ownership.
Scalar composite FKs; arrays/JSON проверяются внутри owning transaction.
SQL parameters, immutable content guards, CAS/fence.
Fixed provider endpoints, no arbitrary URL fetch/executable AI code.
Secrets server env; никогда NEXT_PUBLIC или browser storage.
Uploads private, deadlines/slot/decoded resources/retained bytes bounded.
DB ports никогда не публикуются; web loopback после root port guard.
Public release и paid live experiments не разрешены.

## Parallel Execution Strategy

Freeze canon/file ownership перед writing dispatch.
До двух children, каждый writer в isolated worktree.
Координатор интегрирует общие manifests/lock/migrations.
Unit получает revision/AC/paths/checks/timebox/stop condition.
Каждый parallel unit delivers FILE, not reply.
До запуска unique WORK_UNIT_ID и absolute TRACE_PATH.
Receipt ends Status: completed либо Status: failed.
Fresh regular non-symlink receipt проверяется до integration.
Shared checker: ../../.claude/hooks/check-swarm-receipts.cjs.
Молчание не progress; failed/not-run не pass.
Split file получает owner at creation.

## Swarm Agents

Consequential plan/complex implementation: Astra high policy.
Ordinary implementation/independent review: Sol high policy.
Research: supported Sol fallback if Terra unavailable.
Small correction: coordinator + affected reviewer, без нового полного обзора.
Requested не доказывает actual; неизвестные usage/model=null.
См. ../../docs/development/model-routing.md и telemetry protocol.
Global model settings не менять.

## Git Workflow

Own project files и logical completed changes.
type(scope): description; feat/fix/refactor/test/docs/chore.
Не включать secrets/.env/private assets/node_modules.
Нет Co-Authored-By без enabled attribution.
Не менять root vendor toolkit; проект подключает references.
Code tests/build обязательны перед commit.
Generic push/deploy не расширяет разрешение владельца.

## Available Agents

planner: .claude/agents/planner.md — feature contracts/reuse.
architect: .claude/agents/architect.md — invariant/module decisions.
code-reviewer: .claude/agents/code-reviewer.md — independent anti-drift.
replicate-coordinator/doc-validator: shared root toolkit.
Agent definition — инструкция, не доказательство исполнения.
Actual host routing задаётся supported launch parameters.

## Available Skills

project-context: canonical homeowner domain/caveats.
coding-standards: pure public boundaries.
testing-patterns: risk-driven fixtures/mutations.
security-patterns: provider secrets/boundaries.
sparc-prd-mini: five document roles.
requirements-validator: named AC/scenario contracts.
brutal-honesty-review: independent technical review.
project-work-companion: source-bound preflight/delivery.
Shared skills лежат в root; local links сохраняют один toolkit.

## Quick Commands

/start → scaffold accepted source; /feature → five docs + gates.
/next → own roadmap; /go → route; /run → accepted feature loop.
/plan → bounded work; /myinsights → confirmed lessons.
/deploy доступен generic, public release не разрешён.
Нет /test: используются actual npm scripts.

## Development Insights

Project: docs/insights.md; carrier .claude/insights/index.md.
Canonical dz brain — original /home/2026-AUG-PU-Projects, даже в worktrees.
Перед фичей/review dz recall по Russian/bilingual query.
English empty lexical match не означает empty memory.
Применённые lessons записать в feature receipt.
Confirmed lesson: dz teach/reinforce --no-mirror.
Не выдавать hypothesis/manual reward за измеренный успех.

## Feature Development Lifecycle

PLAN: docs/features/slug/01_specification…05_completion, exact role map.
VALIDATE: source hash, AC→named scenarios, no floor zero.
IMPLEMENT: per-feature local01–07 incl03a/05a → GitHub search BEFORE code.
Record revision/license/contracts/reuse/adapt/new reason.
REVIEW independent of author, spec/code/tests both directions.
One pass→review→concrete fixes→targeted closure.
После каждой фичи mandatory anti-drift.
Coordinator может исправить code OR spec, logs before/after/IDs/reasons/revisions/checks.
Не ослаблять проверки ради срока, не начинать необязательную полировку.

## Feature Roadmap

.claude/feature-roadmap.json — own project state.
F1 identity/ops → F2 space → F3 design → F4 procurement.
F5 billing и F6 sharing подключаются через narrow ports.
Integrated performance/recovery обязательны до handoff.
Done требует code/tests/review, не docs alone.

## Implementation Plans

docs/plans/ — scope/ownership/timebox.
docs/canon.md — shared geometry/entity/API names.
docs/dispatch-plan.md — owners включая coordinator.
docs/source-versions.md — source hashes edits/verdicts.
Новый workflow/validator engine требует конкретного AC.

## Automation Commands

/run → /start → /next → /go → /feature → anti-drift.
Owner уже authorized; revoked CJM wait не восстанавливать.
Automation не разрешает paid inference/publication.
Максимум10h от20:25UTC approval; wake target8h.
Time budget не доказывает прохождение проверок.

## Resources

docs/Specification.md / Pseudocode.md / Architecture.md — normative.
docs/ADR.md / decision-log.md — decisions.
docs/Refinement.md / test-scenarios.md / Completion.md — checks.
docs/validation-report.md — six-role corrected source verdict/caveats.
docs/research/ — source capability/entitlement limits.
docs/discovery/index.html — offline variants, selectedA.
docs/telemetry/p-replicator/20261013T202009Z-expanded-cjm-9f69/ — run evidence.

Public release override (owner2026-10-14): N8 sslip.io HTTPS publication and Docker browser testing explicitly authorized. Prior local-only exclusion remains historical; live paidAI/payments still excluded. Use exacttrustedproxy forclientrate only, preserve actualsocket forpayment source.
