# Ранбук фичи — «Тарелка» (N4), эксперимент EXP-N4-001

Единый порядок для каждой фичи роадмапа. Координатор — текущая сессия (Fable 5.1); исполнитель
плеча — Opus 5 (A) или Sonnet 5 (B) по `docs/development/telemetry/experiments/2026-09-12-n4-profile-ab.md` §8;
валидатор Phase 2 — Sonnet 5 (константа); судья Phase 4 — Codex `gpt-6-astra` medium, слепой (константа).
Чекер трассировки: `/root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh` (1.13.2, DEC-A-010).

## Пути

- Документы фичи: `docs/features/<slug>/01_specification.md … 05_completion.md`, `validation-report.md`, `review-report.md`.
- Телеметрия: `docs/telemetry/p-replicator/<RUN_ID>/{run.json,events.jsonl,receipts/,evidence/}`; `RUN_ID = <UTC>-<slug>-<arm>-<rand>`;
  `run.json.comparison_id = EXP-N4-001@bf467bf640fe/<slug>/<A|B>`.
- Код: монорепо проекта (`apps/web`, `apps/api`, `apps/recognizer`, `packages/db`, `packages/shared`); тесты рядом с пакетом (`tests/`).

## Phase 1 — PLAN (исполнитель плеча)

Читает `docs/canon.md`, `docs/Specification.md` (FR/SC своей фичи по `source_ids` роадмапа), `docs/Pseudocode.md`,
`docs/Architecture.md`, `docs/ADR.md`, `docs/Refinement.md`, `docs/test-scenarios.md`, проектные `.claude/rules/*`,
`.claude/agents/planner.md`. Пишет пять документов по `DOCUMENT_ROLE_MAP` из `.claude/commands/feature.md`
(01 specification — `### AC-<slug>-<n>` заголовки с Given/When/Then, наследует FR/SC проекта; 02 pseudocode — `### Algorithm:`
с `REQUIREMENT:` ключами на FR/NFR ФИЧИ и `## Scenario Coverage`; 03 architecture — размещение по сервисам, схема/миграции,
внешние зависимости фичи; 04 refinement — edge cases и тесты (конкурентные — обязательны для квот/аренды); 05 completion —
чеклист, `## Criterion coverage` заполняется в Phase 3). Ворота: `bash <checker> . --traceability` → 0.

## Phase 2 — VALIDATE (Sonnet 5)

`validation-report.md` по `feature-report-contracts.md`: `Spec revision: sha256:<64 hex>` в первых 20 строках,
`## Criterion scenarios` — каждый `AC-<slug>-<n>` → именованный сценарий, INVEST/SMART, blocking floor, security AC.
Ворота: `bash <checker> . --report-revision --criterion-scenarios` → 0. 🔴 → возврат в Phase 1 (один авто-повтор).

## Phase 3 — IMPLEMENT (исполнитель плеча)

Правила: `.claude/rules/*` проекта и корня (порядок операций безопасности, квота ДО вызова модели, число только из базы,
fail-closed конфигурация, честная конфигурация, порты). Провайдер модели — адаптер с детерминированным фейком (`N4_MODEL_MODE=fake`),
живой режим только с ключом (DEC-A-009). Тесты vitest; конкурентные тесты для разделяемых ресурсов; стражи по исходнику для
инвариантов; порог в тесте — литерал. `docker compose build` обязателен для затронутых сервисов; `docker compose up` — только после
`node ../../.claude/hooks/check-ports.cjs .` и `bash ../../scripts/check-port-conflicts.sh .`. Коммиты по логическим группам с трейлером
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (без push — пушит координатор). В `05_completion.md` — `## Criterion coverage`
(AC → файл теста → дословный заголовок теста). Ворота: `bash <checker> . --completion` → 0; `npm test`, `npm run lint`, `npm run build` зелёные.
Каждая единица пишет квитанцию `receipts/<unit>.md` с `Status: completed|failed` последней строкой.

## Phase 4 — REVIEW (Codex Astra medium, слепой)

Судья получает `01_specification.md`, `validation-report.md`, диф фичи и тесты; НЕ получает имя модели-исполнителя.
Пишет `review-report.md`: `Reviewer family: codex`, `Spec revision: sha256:<64 hex>`, `## Spec conformance` (каждый AC ровно один
раз, `met | not met | unverifiable`, evidence), находки по severity с воспроизведением. Ворота:
`node ../../.claude/hooks/check-review-contract.cjs . <slug>` → 0. blocker/high чинит исполнитель плеча (≤ 2 корректирующих попытки),
повторный проход судьи — только по исправленным пунктам.

## Закрытие

Роадмап: `status: done`, `files`; коммит `feat(<slug>): complete lifecycle [phases 1-4]`; push; `run.json`: `status: accepted|blocked`,
`ended_at`, usage через `node ../../scripts/telemetry/collect-usage.cjs --session <id> --from <начало фичи> --codex --codex-cwd <repo>`
и cost через `cost-from-usage.cjs`; события `attempt_*`, `gate_result`, `finding`, `correction`, `run_finished`.
Для контролируемых пар: worktree `../../../n4-<slug>-<arm>` на ветке `exp/<slug>-<arm>`, вторая реализация не читает первую.
