# N8 — план реализации v1 для XL checkpoint

Статус: план подготовлен, финансовая реализация ждёт явного одобрения этой версии. База: `3b84e9ef`, ветка `feature/08-interior-ai`.
Пути: только `projects/08-interior-ai-redesign/**`. Общий toolkit, проекты N6b/N7, shared proxy и их настройки не меняются.
Подготовка discovery, трёх CJM HTML, спецификации и независимого review обратима и уже разрешена.

## Результат и границы

RoomKind: фото комнаты → выбор стиля → надёжная очередь → SD + ControlNet-depth → проверка геометрии → сравнение до/после → приватная галерея → добровольный branded share; пакет генераций через hosted checkout.
Не входят: мебельный каталог, 3D, сотрудничество с дизайнером, отправка приглашений, подписки, выплаты партнёрам и referral reward engine.
Первичный growth loop: content-driven, CJM A (`CJM_Variants.md`). Публичная галерея только по отдельному согласию на конкретную работу; unpublish отзывает публичный путь.

## Архитектурное решение

Distributed monolith в проектном monorepo: web/API, PostgreSQL, отдельный Python GPU-worker в Docker Compose. Postgres хранит очередь; Redis не нужен. Приватные файлы на отдельном shared volume с opaque UUID, чтение через авторизованный API. База только `expose`, loopback web порт через переменную; перед запуском штатная проверка конфликтов портов.
Worker забирает задачу транзакционно через `FOR UPDATE SKIP LOCKED`, записывает lease, heartbeat и fencing token. Повторный worker не может завершить чужую просроченную попытку. При падении — ограниченный retry, после дедлайна явная ошибка и возврат резервированного кредита.
Diffusers StableDiffusionControlNetImg2ImgPipeline получает исходный кадр и реальную depth-карту. Параметры, model revision, seed и input SHA фиксируются. Никакой подмены генератора на OpenAI image API или незаявленный mock.

## Качество геометрии — отдельный обязательный gate

Документация [Diffusers ControlNet](https://huggingface.co/docs/diffusers/api/pipelines/controlnet) подтверждает spatial conditioning, но не математическую гарантию неизменности окон. Проверено 2026-10-02. Короткая цитата: “preserve the spatial information from the depth map”.
На согласованном наборе минимум 12 реальных комнат × 3 стиля сохраняем оригиналы, depth, результат, модель, параметры и длительности. Ручная независимая разметка окна/двери/стыки стен: ноль появившихся/исчезнувших проёмов, смещение контрольных точек ≤2% диагонали кадра. Каждый выпущенный публичный пример должен пройти. Набор с недопустимыми отклонениями не объявляется quality-pass; потребуется коррекция параметров/масок и повтор затронутого набора.
~25 секунд — цель warm-generation, не измеренный SLA. p95 ≤25 сек измеряется только на ≥30 реальных GPU-задачах с отдельно указанным queue time. До замера UI не обещает подтверждённую скорость.
Текущий host: `/dev/nvidia*` не обнаружены; DRM vendor `0x1013`, device `0x00b8`; Docker runtime NVIDIA не зарегистрирован. CUDA execution не подтверждён. Продукт может быть технически подготовлен и проверен на fixtures, но фактический geometry/performance gate останется незавершённым до доступного GPU.

## Финансовый контракт, который предлагается одобрить

1. Бесплатный пользователь получает один пробный кредит; защита от повторной выдачи в БД. Это не доказательство защиты от всех Sybil-аккаунтов; IP rate limit ограничивает злоупотребление.
2. Один пакет: 20 генераций, предлагаемая стартовая цена 900 RUB. Это гипотеза цены, не подтверждённая экономика. Перед live запуском цена сверяется с фактическими GPU-затратами и провайдером.
3. Предлагаемый провайдер — YooKassa hosted redirect; локально deterministic provider fixture (никакой вымышленной подписи YooKassa), отдельно test-mode провайдера при наличии разрешённых ключей. Выбор провайдера и цена входят в checkpoint, реальные списания отсутствуют.
4. Server определяет amount/currency/package/user/order; браузер передаёт только package code. Повтор checkout по idempotency key возвращает тот же заказ.
5. Входящий webhook сам не выдаёт кредит: server проверяет payment через API провайдера, совпадение account/order/amount/currency/status, затем одним transaction создаёт уникальную ledger-запись и credited order. Return URL не является подтверждением оплаты.
6. Проверка replay и concurrent duplicate гарантирует ровно одно начисление. Invalid/unknown payment не выдаёт кредит. Частично недоступный provider переводит событие в retry, без успешного подтверждения исполнения.
7. Start generation транзакционно резервирует один кредит вместе с job. Retry с тем же job не расходует второй. Accepted result финализирует расход; terminal error/quality rejection возвращает ровно один резерв. Денежные refunds не симулируются и не отправляются автоматически.
8. Export badge entitlement берётся из подтверждённого пакета, а не client flag. Партнёрская атрибуция фиксируется перед первой paid conversion; cookie и ручной код независимы. Self-referral и duplicate conversion не попадают в партнёрские агрегаты; выплат нет.

## Разрешаемые действия и остановки

Одобрение v1 разрешает код, локальные миграции, тестовые fixtures, Docker на изолированной проектной сети, package install, review, коммиты/push и draft PR в `claude/install-npm-packages-n7l3m5`.
Оно не разрешает live charges, аренду GPU, платежи поставщикам, production mail, deploy, shared proxy changes или публикацию пользовательских фото.
Лимит новых внешних затрат текущего плана: **0**. Для GPU потребуется отдельный конкретный provider/SKU, потолок стоимости и явное одобрение; сейчас аренда не предлагается как совершённое действие.

## Команда, модели, навыки и работа

Координатор/planner: текущий native Astra high; фактическая модель требует host evidence, self-report не заменяет receipt. Ограниченный coder: `gpt-6.1-sol`, requested effort high, отдельное worktree. Reviewer: свежий отдельный Astra high, не автор кода. Все coding agents — OpenAI. Исторический routing перечисляет Sol 5.6; переход на доступный Sol 6.1 — явный user-directed override, не изменение глобальной конфигурации.
Навыки: reverse-engineering-unicorn QUICK, sparc-prd-mini, requirements-validator, cc-toolkit-generator-enhanced, project-work-companion. Общий toolkit только читается.
Сначала discovery → SPARC → машинные gates → независимая validation → project toolkit → `/next` → `/go` для каждой реализации. Один writer на worktree, интегратор один. Ограниченные попытки по 15–25 минут; после бюджета артефакты проверяются, причины задержки сообщаются.

## Приёмочные критерии и проверки

| AC | Доказательство |
|---|---|
| Три различных CJM, выбран A, альтернативы сохранены | Три HTML, доступные keyboard/mobile; статическая проверка и browser clicks |
| Upload security | JPEG/PNG/WebP magic bytes, 10MB/20MP лимит, EXIF removal, нет path traversal, IDOR тест двух пользователей |
| Queue correctness | Реальный Postgres: конкурентное резервирование, worker crash/reclaim, fencing, retry, terminal refund |
| Настоящий редизайн с геометрией | Указанный GPU corpus gate; fixtures никогда не засчитываются |
| Оплата | Неверная сумма/provider verification/status/account, replay/concurrent duplicate, return forgery, provider timeout |
| Private gallery + compare + share | Chromium mobile/desktop через существующий Docker browser; explicit consent, revoke и cross-user denial |
| Growth | FR-GROWTH-001..005, happy/edge/security сценарии; share attempt/completion и paid conversion отдельно, статистика без выдуманных процентов |
| Delivery | Все требуемые gates, независимый review, source/build receipts, русский commit/push, PR; pending GPU gate явно блокирует MVP-complete |

Финальный статус не будет «MVP готов», пока geometry, payment и app E2E остаются непроверенными. Разрешённая независимая работа продолжается во время ожидания checkpoint.

## Проверенные основания платёжного контракта

[YooKassa payment process](https://yookassa.ru/developers/payment-acceptance/getting-started/payment-process), [webhooks](https://yookassa.ru/developers/using-api/webhooks), [interaction format](https://yookassa.ru/developers/using-api/interaction-format) открыты 2026-10-02. Provider GET verification применяется вместо предположения о наличии webhook signature. Create payment принимает amount и idempotency key; credit ledger остаётся нашей ответственностью.
