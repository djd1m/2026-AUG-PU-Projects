# Phase 1 (PLANNING) — общая постановка для авторов SPARC, проект 05a

Корень проекта: `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/05a-podcast-clips-opus`
Корень репозитория (навыки, правила, хуки): `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects`

## Входы (контекст для sparc-prd-mini в режиме AUTO с предзаполненным контекстом)

| Файл | Что даёт |
|---|---|
| `docs/discovery/00-postanovka.md` | постановка, MVP-scope, НЕ входит, GROWTH MECHANICS CONSTRAINTS |
| `docs/product-discovery-brief.md` | Product Discovery Brief (Phase 0), Growth Requirements Seed |
| `docs/CJM_Variants.md` | **{CHOSEN_CJM} = Variant A** + обязательные «Поправки к A» (раздел в конце) |
| `docs/reviews/cjm-review.md` | cross-family review, находки CJM-R-01…15 |
| `docs/source-product-profile.md` | FR-LOOK-001…013 (промотировать в Specification или отклонить с причиной) |
| `docs/discovery/R1-market.md`, `R2-growth.md` | рынок, юнит-экономика, тренды, safe zones |
| `docs/discovery/R3-jan-audit.md` | что есть в январском доноре и в каком состоянии |
| `.reference/jan-clone/` | январский код и документы (только чтение) |
| `docs/decisions-owner.md` | решения владельца |

ЗАПРЕЩЕНО читать `projects/05-podcast-clips-opus/` — проект делается с нуля.

## Architecture Constraints (обязательны)

```yaml
pattern: Distributed Monolith (Monorepo)
containers: Docker + Docker Compose
infrastructure: VPS (AdminVPS/HOSTKEY)
deploy: Docker Compose direct deploy
ai_integration: MCP servers
storage: PostgreSQL в контейнере; у БД/Redis/MinIO НЕТ публикации на хост, кроме 127.0.0.1/::1
files: Cloud.ru Object Storage (S3) в боевом профиле, MinIO только в тестовом (OWN-004)
queue: BullMQ/Redis (OWN-003)
heavy_processing: ffmpeg в отдельном сервисе-воркере compose
host_ports: только ${VAR:-default}; на машине заняты 80, 443, 3002, 5480, 8080, 8081, 8088, 11000, 11001, 11379, 11432
models: только облачные API (локальных моделей нет); managed BaaS (Supabase/Firebase/Neon) запрещены
```

## Правила, которые документы обязаны учесть (прочитать в `.claude/rules/`)

`replicate-pipeline.md` (Phase 1), `honest-configuration.md`, `fail-closed-defaults.md`, `silent-fallbacks.md`,
`long-running-job.md` (рендер идёт минутами), `model-call-cost.md` (платные вызовы STT/LLM запускает посетитель),
`incoming-webhooks.md` (оплаты на неделе нет — законный ответ «вебхуков нет»), `embeddable-widget.md`
(виджета нет — «не встраивается»), `security-operation-order.md`, `shared-resource-verification.md`,
`deployment-seams.md`, `docker-ports.md`, `p-replicator-known-gaps.md` (PR-001…007).

## Формат

- Навык: `.claude/skills/sparc-prd-mini/SKILL.md` — режим AUTO, фазы Explore/Research/Solve не разворачивать заново
  (ответы уже есть в Phase 0); `Research_Findings.md` и `Solution_Strategy.md` — синтез входов, не новый поиск.
- Машинные ключи: `### FR-<slug>-<n>`, `### NFR-<slug>-<n>`, `### AC-<slug>-<n>` — заголовки 3-го уровня в
  Specification; в Pseudocode каждое `### Algorithm:` несёт `REQUIREMENT: \`FR-…\``. Плюс FR-GROWTH-001…004
  (и 005, если принят) и промотированные FR-LOOK-nnn — в их исходном формате id.
- Каждый FR-GROWTH — три Gherkin-сценария с тегами `@happy-path` (с числом), `@edge-case`, `@security` (anti-fraud).
- Метрика = название + число + срок. Неизвестное — `[НЕ ПРОВЕРЕНО]`, не догадка.
- Места, зависящие от нерешённой архитектурной развилки: `[ADR-PENDING: ADR-nnn <суть>]` — не выбирать молча.
- Язык документов — русский.
