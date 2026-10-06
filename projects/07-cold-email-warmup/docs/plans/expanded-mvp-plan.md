# N7 — расширенный MVP, план XL

Дата: 2026-10-06. RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1. WORK_UNIT_ID: plan-1.
Source revision: 98d4418c; проект projects/07-cold-email-warmup в .claude/worktrees/n7-replicate.
Статус: конкретный проект плана для checkpoint владельца; реализация и live-приёмка этим файлом не подтверждаются.

Владелец расширил исходный MVP до всех трёх целей: unlimited connected mailboxes, постоянно работающий автоматический прогрев и AI-ответ с измерением arrival→SMTP accepted p95<300s. AI входит в обязательный scope. Черновик и ручное одобрение — обязательный безопасный режим; автопилот имеет отдельное согласие и является необходимой веткой для проверки полного SLO. Принятые F01–F06 остаются локальным фундаментом. Новый план заменяет исключение AI из PRD/CLAUDE и local-only ограничение реализации, но не превращает разрешение писать код в разрешение внешних отправок, расходов или deployment.

## Границы и предлагаемые параметры

Unlimited — отсутствие тарифного потолка 3/10 для количества подключённых mailbox records; это не бесконечная одновременная работа, не снятие rate limits и не unlimited sending. Активная ёмкость резервируется атомарно; превышение переводит ящик в видимый waiting_capacity без потери конфигурации. POST подключения ограничен существующим антиабьюзом, пагинацией и разумным размером запроса. TEST billing и стоимость/срок TEST entitlements не меняются; деньги и live paid billing не входят в задачу.

Proposed assumption A1 для checkpoint: 100 подключённых, 30 одновременно активных ящиков, ≥3 tenant, ≥2 независимых opt-in tenant для пула, 7 суток пилота 24×7. Контрольная нагрузка: 300 заранее пригодных входящих AI-событий за окно, ≤1 входящего/мин в среднем, burst 6 за минуту распределённо, ≤8 AI-ответов/ящик/сутки; дополнительные error/unsafe fixtures идут в полный журнал. На каждом ящике общий default10/day и ceiling30/day сохраняются для warmup+campaign+AI; для тестового дня планируют доступный бюджет, не повышают его ради SLO. Это ограниченная проверяемая нагрузка, а не прогноз коммерческой ёмкости. Стенд фиксирует CPU/RAM/PG/runtime/сеть; на старте предлагается 2 vCPU/4GiB суммарного app+worker бюджета, фактические ресурсы публикуются. Если ресурсы/провайдеры не позволяют A1, план пересматривается до пилота с новым checkpoint, не сужается задним числом.

Proposed assumption A2: healthy poll cadence каждого активного ящика≤30s, complete poll age<60s для отправки; fair due-work round≤60s при A1; pool allocation round≤5min для всех eligible участников со свободным budget. SMTP одновременно≤2 global и1/mailbox, IMAP≤4 global и1/mailbox, LLM≤2 global; распределение между tenant — round robin по oldest due. SMTP min spacing60s/mailbox, no burst; provider lower cap/cooldown wins. Это начальные настройки, проверяемые нагрузкой и изменяемые только с зафиксированным тестом.

Proposed assumption A3: body plain text≤32KiB/сообщение, thread≤5 сообщений и≤64KiB суммарно; вложения/remote URLs не загружаются. Body/context/draft удаляются≤24h после terminal outcome, absolute TTL7days даже для pending; audit metadata30days без body. LLM input≤8000 tokens, output≤500, timeout30s, max2 generation attempts только при доказанном отсутствии результата, общий бюджет generation≤65s. Денежный live ceiling не выдумывается: оператор задаёт positive daily token/currency cap и явно разрешённый OpenAI project/model; без них live LLM disabled. Content disclosure для передачи OpenAI — отдельное явное согласие.

## Малые slices и порядок

| Slice | Результат / границы файлов внутри проекта | Зависимости и обязательная приёмка |
|---|---|---|
| f07 connected-capacity | src/billing/plans.ts, src/mailboxes, migration, mailbox UI: unlimited connected + finite active admission | Политика scope; создание 101-го без plan cap, atomic active cap, tenant tests; TEST billing regression |
| f08 live-diagnostics | src/mailboxes/verify, config, thin transports, deps/lock: SMTP и IMAP независимо, без DATA | Документированные capability/library контракты; TLS/DNS pinning/AEAD/canary protocol fixtures |
| f09 live-transport | src/dispatch adapter и bounded src/replies reader | f08; real protocol fixture, post-DATA ambiguity, UID reset/crash/replay, все stop races |
| f10 durable-runtime | workers/compose/pool/PG due-state: persistent loops, fairness/backpressure | f09; restart recovery, 30 active cadence, no-starvation, shared quotas, pair conflict skip |
| f11 inbound-context | replies/body/intent store, additive migration | f09; bounded parsing/TTL, tenant binding, unsubscribe/bounce/OOO/loop holds, stop first |
| f12 ai-drafts-hitl | src/ai OpenAI boundary, draft store/API/UI | f11; bounded grounded output, prompt injection, budget/idempotency, versioned approval, Docker browser |
| f13 ai-authority-send | reply purpose/consent + existing final dispatch fence | f10,f12; revoke race, expired/scope mismatch, suppression/quotas, unknown no retry |
| f14 capacity-slo | telemetry/report + dashboard/runbooks/load fixtures | f07–f13; all denominators, time provenance, p95/p99, restart/performance, full independent acceptance |
| f15 authorized-live-pilot | operational evidence only after external gate | f14 local accepted + explicit account/provider/mail/LLM/budget authorization; 7day A1 and honest pass/fail |

Каждый slice проходит один implementation → fresh independent review → исправления конкретных находок. Код Sol6.1 high, архитектура и независимое ревью Astra high. Фактическую модель подтверждает host receipt, название роли не является доказательством. Попытка кода≤20min, ревью≤8min; истечение бюджета требует проверки артефактов и конкретного продолжения с ответственным. Независимые writers получают разные файлы/изолированные worktrees и frozen digest; coordinator единолично интегрирует schema/config/lock. Не более4 реально работающих units вместе с другими проектами. Коммиты по логическому изменению, русские conventional messages, push origin feature/07-cold-email-warmup после принятой проверки; target PR claude/install-npm-packages-n7l3m5.

## Канон и повторное использование

После принятия плана coordinator переносит эти delta roles в docs/features/expanded-mvp/, план в docs/plans/, связывает PRD/Specification/Pseudocode/Architecture/Refinement/Completion/ADR, decisions-owner и roadmap. Не создавать конкурирующий полный канон. Поправить устаревшие AI/local-only утверждения целенаправленно; исторические local evidence сохранять. PostgreSQL queue, global lock(7,1), server AEAD+tenant/mailbox AAD, tenant auth и shared quota остаются N7. Не переносить Nest/Prisma/BullMQ/Redis и донорские retry/auth/crypto. Допустимы ограниченные donor01 CSV aliases/BOM, status UX, transport construction reference с provenance и новыми N7 tests; CSV не блокирует основные цели и не расширяет эту поставку.

## Checkpoints и ворота

1. XL owner plan checkpoint: root фиксирует применимое разрешение на конкретный расширенный scope, assumptions A1–A3, team и документированную delta. Root оценивает имеющуюся авторизацию; этот checkpoint не повод прекращать подготовку конкретного reviewable плана. До такого решения продуктовый код не начинается.
2. PLAN: пакетный check-pipeline-gaps --traceability exit0; VALIDATE: requirements-validator + revision/scenario gate exit0. Любой1/2 блокирует соответствующую стадию. UNCONFIRMED capability закрыть первичной документацией до реализации зависимой live-ветви; fixtures и независимые slices продолжаются.
3. IMPLEMENT: npm test, npm run lint, npm run build; реальный PG, protocol fixtures, security/concurrency/crash tests; Docker Playwright1.63.0 только для UI, браузер на host запрещён. Criterion coverage gate и source-bound review contract exit0, blocker/high findings исправлены. Canon/source/ownership/swarm receipt checkers обязательны при делегировании.
4. Перед внешним пилотом: конкретные аккаунты и opt-in peers, provider policy/auth method, TLS endpoints, complaint intake, approved OpenAI model/project+budget+content consent, retention notice, операторский live gate с expiry, kill switch/drain/reconciliation, backup/restore и rollback проверены. Внешние SMTP/IMAP/LLM и deployment требуют применимого явного разрешения; наличие credentials его не доказывает.
5. Две отдельные готовности: implemented+tested fixtures и live end-to-end accepted. f15 остаётся pending/blocked_by_external_gate, пока нет живых receipts. Не писать done всему обещанию по одним fixtures. Owner получает точный внешний блокер и выполненную независимую часть.

## Метрики и отчёт

t_arrival берётся из проверенного серверного источника получения, не Date отправителя и не t_observed; произвольный IMAP INTERNALDATE без подтверждённой семантики не считается достаточным. Для контролируемого пилота допустим журнал принимающего сервера с синхронизированными часами и связью event/message-id. Отсутствующее время — unknown. Arrival→observed, observed→draft, approval wait, approval→SMTP accepted и arrival→SMTP accepted показываются отдельно. SMTP accepted означает успешный финальный ответ сервера после DATA, не доставку/inbox placement.

SLO автопилота: p95 arrival→SMTP accepted<300s при A1, 300 eligible arrivals в7day window. Знаменатель фиксируется на arrival по версии политики; outage/quota/error/unknown и незавершённые deadline≥300s события не исчезают. Effective latency незавершённых/error/unknown=+infinity для ранга; unknown также отдельный счётчик и препятствие безусловному утверждению arrival-SLO. Публикуются N всех arrivals, N eligible, approved/HITL, held/unsafe, ontime, late, error, pending_overdue, unknown_timestamp, unknown_delivery, reason codes и число валидных timestamps; completed-only p95 — лишь дополнительная диагностика. Дополнительно минимум95% eligible имеют подтверждённое SMTP accepted<300s; p99 и maximum публикуются без заявленного p99 target. HITL ожидание не вычитается из полного времени и не подменяет reply-SLO draft-SLO. Исключения intent/scope устанавливаются до начала окна, полный traffic report включает их всегда.

Все величины получают источник «наша БД» (durable events/attempts/poll cursors/quotas) либо «наш журнал» (provider timing proof/resource samples). Существующие 85–109ms API результаты не входят в новый SLO. Репутация остаётся unknown до реальных сопоставимых наблюдений.

Телеметрия обновляется при каждой стадии/делегировании/retry/model fallback: revision, AC remaining, next responsible worker, start/end wall time, host-confirmed actual model, available usage/cost и missing fields. Native модель/usage здесь хостом не подтверждены; не восстанавливать их по памяти. Отдельный source-bound итог связывает каждый AC с тестом и live evidence, без fake pass.

## Наследуемые требования полного продукта

Расширение трёх целей не удаляет остальной первоначальный scope. FR-n7-001/002 сохраняют регистрацию, tenant isolation и безопасное подключение; FR-n7-003/005 — отдельный campaign consent, ротацию ящиков, персонализацию полями и последовательности; FR-n7-006/007 — stop-on-reply, unsubscribe, suppression и complaints; FR-n7-004/008 — opt-in network pool, seed cohort и только доказуемые репутационные наблюдения; FR-n7-009 и FR-GROWTH-001..004 — TEST checkout, share-at-value, attribution, report badge и partner codes/program. AC-N7-001..012 предыдущего принятого плана остаются regression gate вместе с новыми AC-expanded-mvp-001..009. Изменяются только коммерческий connected cap, локальное ограничение почтовой реализации и прежнее исключение AI по новому поручению владельца; CRM/domain purchase/email validation/real charge не добавляются.

## Известный подготовительный долг gate

Root установил: полный project traceability сейчас exit2 из-за legacy hyphen role filenames/outline contents у6 исторических features; canonical root16requirements↔16algorithms проходят. Перед IMPLEMENT нужен отдельный ограниченный preparatory task: сохранить исторические evidence/revisions, определить совместимое отображение/миграцию role map, исправить установленный input contract, затем получить full-project gate0. Этот PLAN не переписывает историю и не называет pipeline зелёным. Проверка нового feature в exact-byte staging допустима только как selected-feature proof, не full-project PASS. Координатор отвечает за debt closure и трассируемость старых отчётов.
