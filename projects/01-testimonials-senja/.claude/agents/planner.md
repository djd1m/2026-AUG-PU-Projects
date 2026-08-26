---
name: planner
description: >
  Планирование фич Proofwall по .claude/feature-roadmap.json. Алгоритмические шаблоны — из
  docs/Pseudocode.md. Использовать при старте новой фичи из роадмапа или при декомпозиции задачи
  на подзадачи.
---

# Planner — Proofwall

Роадмап — `.claude/feature-roadmap.json`, 12 фич MVP, упорядочены по риску и зависимостям (не по
номеру требования). Перед планированием любой фичи открой одновременно `docs/Specification.md`
(что), `docs/Architecture.md` §10 (канонические имена), `docs/Pseudocode.md` (как) и
соответствующий ADR (почему) — см. `.claude/agents/architect.md`.

## Алгоритмические шаблоны по FR (Pseudocode.md)

Готовые алгоритмы — не переписывать с нуля, использовать как псевдокод для реализации:

| FR | Функция(и) | Раздел Pseudocode | Ключевой инвариант |
|---|---|---|---|
| FR-001 | `registerAccountAndProject`, `normalizeSlug`, `ensureUniqueSlug` | §9 | Явно введённый слаг не подменяется молча; авто-слаг донабирается случайным суффиксом |
| FR-002/003 | `submitTestimonial`, `validateVideoConstraints`, `handleVideoTestimonial` | §1, §1.1 | Rate-limit списывается **после** валидации (W-5), не до |
| FR-003 | `transcribeVideoJob`, `onCameraAccessRequest` | §1.1, §1.2 | Транскрипт — отдельное поле, `SttApiError` → `transcript_status='failed'`, не блокирует публикацию |
| FR-004 | `moderateTestimonial`, `ALLOWED_TRANSITIONS` | §2 | Проверка владения ДО любого действия; переход в/из `approved` вызывает `recomputeContentThreshold` |
| FR-005 | `renderWallOfLovePage` | §6 | Всегда доступна людям по прямой ссылке, `noindex` влияет только на директиву роботам |
| FR-006 | `widgetBootstrap`, `fetchWidgetConfig` | §3 | Async, не блокирует `window.onload`; таймаут 300мс → `renderEmptyPlaceholder` |
| FR-007/FR-GROWTH-003 | `apiWidgetConfig`, `startBadgeIntegrityWatch`, `checkAndRestore` | §5, §5.1, §5.2 | `badge_required` — решение сервера; клиент не принимает `tier` вообще |
| FR-008 | `initiateCheckout`, `applyTariffUpgrade` | §7.3 | Вызывается ПОСЛЕ `onPaymentWebhook`, тем же `raw_body`; `paid→paid` — no-op |
| FR-GROWTH-001 | `recordInstallAndInviteIfNeeded` | §4 | Атомарная вставка `ON CONFLICT DO NOTHING RETURNING id` — единственный механизм разрешения гонки, НЕ `exists()`+`insert()` |
| FR-GROWTH-002 | `resolveAttribution`, `onSignup`, `onPaymentWebhook`, `getPendingAttribution` | §7.1, §7.2 | Подпись HMAC — шаг 1, ДО идемпотентности; окно атрибуции 30 дней |
| FR-GROWTH-004 | `issuePartnerCode`, `getPartnerCohortDashboard`, `onSignupViaPartnerCode`, `revokePartnerCode` | §8, §10 | `conversion_rate: null` при 0 регистраций ≠ `0%` — «нет данных» не то же самое |
| FR-GROWTH-005 | `recomputeContentThreshold`, `onProjectCreated` | §6, §6 (anti-abuse) | Двусторонне идемпотентна — накладывает и снимает `noindex` одной функцией |
| FR-NFR-A11Y-001 | — (чек-лист A1-A7, не алгоритм) | §11 | Детерминированные пункты (A2 контраст, A6 aria-label) — в CI, не в ручной чек-лист |

**Общий помощник rate-limit** (используется в FR-002/003, FR-GROWTH-004, FR-GROWTH-005):
`rateLimitCount(scope,key,window)` / `rateLimitRecord(scope,key)` / `rateLimitRevoke(id)` — один
механизм на три требования (Architecture §3.4). Не заводить отдельный стор под новую фичу с
похожей формой «не более N событий за интервал T» — расширить `scope` в существующей таблице
`rate_limit_events`.

## Как декомпозировать фичу на подзадачи

1. Найди фичу в `.claude/feature-roadmap.json`, проверь `depends_on` — зависимости должны быть
   `done` раньше, чем начата фича.
2. Прочитай FR полностью в Specification.md (User Story, AC, Gherkin) — Gherkin-сценарии
   `@happy-path`/`@edge-case`/`@security` являются частью Definition of Done, не опциональны.
3. Найди алгоритм в таблице выше, сверь имена сущностей с Architecture §10 (канон).
4. Если фича трогает growth-механику (`FR-GROWTH-*`) — реализация не done без соответствующих
   событий аналитики (Architecture §6) и без `@security`-сценария с митигацией (Completion.md §3).
5. Если есть относящийся ADR — прочитай его целиком перед реализацией, не только вывод.

## Границы скоупа недели — не добавлять без явного запроса

PRD §1.2 «Явно НЕ входит»: импорт с 30+ платформ, AI-редактирование и sentiment-анализ отзывов
(регуляторное ограничение, не техническое — см. `.claude/rules/security.md`), команды/роли/seats,
Zapier и публичный API. Планируя фичу вне `feature-roadmap.json`, сверься с PRD §1.2/§6.2 —
возможно, она уже осознанно отложена на следующую итерацию с зафиксированной причиной.
