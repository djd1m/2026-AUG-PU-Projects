# Грелка — N7 (Instantly-клон · cold email с прогревом)

## Project Documentation

Проект следует SPARC. Читать в порядке:

### 1. Specification (ЧТО строим)
- `docs/Specification.md` — US/AC (Gherkin), FR-/NFR-ключи, Growth Trace (7 требований из Phase 0)
- `docs/PRD.md` — продукт, персоны, метрики

### 2. Pseudocode (КАК работает)
- `docs/Pseudocode.md` — 20 алгоритмов (REALISES/REQUIREMENT), контракты API, покрытие 32:31 (один сценарий ui-only)

### 3. Architecture (СИСТЕМА)
- `docs/Architecture.md` — разделённый монолит, стек, внешние зависимости (цитаты+даты), §Reuse из 01–06

### 4. Refinement (КАЧЕСТВО)
- `docs/Refinement.md` — edge cases, стратегии тестов, оптимизации

### 5. Completion (ДЕПЛОЙ)
- `docs/Completion.md` — CI/CD, мониторинг, runbook, rollback

Конвейер: `docs/product-discovery-brief.md` (Phase 0), `docs/discovery/CJM_Variants.md` + `cjm-prototype.html` (выбор владельца — гибрид H), `docs/source-product-profile.md` (облик НЕ ИЗМЕРЕН — фолбэк-палитра подписана), `docs/Final_Summary.md`, `docs/ADR.md`, `docs/Research_Findings.md`.

## Implementation Rules

### Code Standards
- Реализация строго по Pseudocode.md (алгоритм=id требования); расхождение → сначала документ, потом код.
- Все ключи FR-*: при реализации держать ссылку на US/SC в тестах.
- Комментарии — только там, где решение неочевидно; запрещены plaintext секреты в логах.

### Priority Order
1. Must (Specification §8) → 2. Should → 3. Could.

### Незыблемое (не ослаблять):
- отписка RFC 8058 в КАЖДОМ письме, стоп-лист перед КАЖДОЙ отправкой, записи согласий (пул/запуск) в audit_log;
- fail-closed лимиты (ящик/день, аккаунт/день); жалоба → автопауза;
- TLS-only SMTP; AES-256-GCM envelope секретов; входящие — только метаданные.

### Testing
- Тесты: алгоритмы из Pseudocode — unit с инъекциями; интеграция — Testcontainers (Postgres 16 + Redis 7.4); E2E Playwright.

## File Structure (план репозитория проекта)

```
apps/
├── web/            # React+Vite SPA (RU UI)
├── api/            # Fastify HTTP API
├── worker-warmup/  # прогрев: план/пары/маркер
├── worker-campaign/# кампании: слоты/ротация/стоп
└── worker-imap/    # входящие: ответ/отписка/жалоба
packages/
├── queue/          # BullMQ-обёртка (донор N6)
├── db/             # миграции/драйвер pg
├── secrets/        # AES-256-GCM envelope
└── shared/         # Zod-схемы API
```

## Quick Reference

### Key Entities
user · domain · mailbox (+secret_envelope) · pool_membership · warmup_plan/pair · campaign(+step)/recipient/send_log · stoplist_entry · inbound_event · health_snapshot · partner_code/attribution/commission_event · subscription/billing_event · audit_log

### API Endpoints (основные)
`/api/auth/*`, `/api/domains`, `/api/mailboxes`, `/api/mailboxes/:id/pool`, `/api/pool[/public]`,
`/api/campaigns*`(list/recipients/launch/pause), `/api/health/:domain_id`,
`/api/billing/checkout`, `/api/webhooks/yookassa|stripe`, `/api/partner/*`, `/u/unsubscribe`, `/healthz`.

### Environment Variables
```
DATABASE_URL=            # Postgres
REDIS_URL=               # очередь
MASTER_KEY=              # KEK для конвертов секретов (∉ БД)
YOOKASSA_SHOP_ID= / YOOKASSA_API_KEY= / YOOKASSA_API_URL=
STRIPE_SECRET_KEY= / STRIPE_WEBHOOK_SECRET=
JWT_ACCESS_TTL= / JWT_REFRESH_TTL=
POOL_CRITICAL_MASS=25    # порог честной метки
FREE_DAILY_LIMIT=20 / BASE_DAILY_LIMIT=100 / PRO_DAILY_LIMIT=300
```

## Getting Started

```bash
npm install
npm test
docker compose up -d      # стек на VPS / стенде
npm run dev               # локально api+web
```

## Notes for AI Assistants

- Сначала Specification.md; потом Pseudocode.md (точные шаги); Architecture.md — выборы, Refinement — edge cases; донорные пути — Architecture §Reuse.
- Доноры копировать ПАТТЕРНОМ с адаптацией, сверляя версию их репо.
- НЕ добавлять в письма бейджи/attribution-маркеры — они ломают доставляемость (Specification §5, FR-GROWTH-003-частный случай).
- Прогрев-письмо обязан содержать человекочитаемый маркер прогрева.
