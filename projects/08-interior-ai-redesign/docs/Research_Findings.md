# N8 — Research Findings

2026-10-13 · исследовательский пакет переиспользован; эта стадия не запускает новый широкий market research. Цель: отделить доступные строительные блоки от неподтверждённых внешних обещаний для выбранного A.

## Executive Summary

Проверяемая цепочка возможна на ручных обмерах/GLB, детерминированной сцене и ручных товарных снимках. Реальные OpenRouter/ЮKassa протоколы документированы, но ключи/merchant/spend разрешения отсутствуют. У двух retailer product pages обычный Chromium вернул 401; автоматическая актуализация цены не является обязательным MVP.

## Methodology and source register

Сначала использованы переданные local source-bound исследования, затем точечно открыты первичные документы для capabilities/коротких цитат. GOAP gap: нужен подтверждённый протокол → документация → scope fallback при отсутствии; не повторять уже выполненный анализ рынка/форматов. Криптографические подписи не заявляются; hashes в receipts подтверждают локальный snapshot, не истинность утверждения.

| Источник | Что подтверждает / граница | Надёжность |
|---|---|---|
| [Pinned gist](https://gist.github.com/djd1m/3dd228d9f6b09b5249dfb35bfdc59aeb), revision ea74394… | Целевой journey владельца, не статистика рынка | Первичный owner source |
| [spatial-ai](research/spatial-ai.md) | Форматы/mesh-splat, model metadata, OSS revisions/licenses; точность/quality benchmark отсутствуют | Первичные docs в отчёте, оговорки сохранены |
| [references-commerce](research/references-commerce.md) | Pinterest access, розничные единицы/регион и budget pitfalls | Первичные docs, нет live catalogue договора |
| [reuse-inventory](research/reuse-inventory.md) | Local N1–N7/03a/05a и GitHub кандидаты | Чтение исходников, donor tests не запускались |
| [retail-browser-addendum](research/retail-browser-addendum.md) | Два ordinary Chromium 401, 0 JSON-LD в ответах отказа | Прямое ограниченное наблюдение, не глобальная невозможность |
| [OpenRouter completion](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion), [schema](https://openrouter.ai/docs/guides/features/structured-outputs) | POST/chat response и schema request | Первичный technical contract; response всё равно валидировать |
| [OpenRouter spend controls](https://openrouter.ai/docs/guides/best-practices/spend-controls) | Workspace/per-key guardrails | Первичный doc; настроенного лимита проекта пока нет |
| [ЮKassa quick start](https://yookassa.ru/developers/payment-acceptance/getting-started/quick-start), [webhooks](https://yookassa.ru/developers/using-api/webhooks) | Redirect checkout/verification/refetch | Первичный doc; merchant authorization не проверена |
| [Лемана B2B](https://developers.lemanapro.ru/b2b-started/) | Интеграция после approval/credentials | Первичный doc; не anonymous B2C API |
| [glTF Validator](https://github.com/KhronosGroup/glTF-Validator), [Babylon](https://github.com/BabylonJS/Babylon.js), [pg-boss](https://github.com/timgit/pg-boss) | Готовые OSS кандидаты вместо нового renderer/validator/broker | Первичные репозитории, версия/лицензия заново при feature reuse gate |

Exact provider quotes/date/verdict/corresponding requirement are in Architecture External Dependencies; не размножать несовместимые списки. Наличие библиотечного parser не подтверждает безопасность любых неподдерживаемых input.

## Market Analysis and Competitive Landscape

Рыночный размер, TAM/SAM, CAC, доли сегментов и платежеспособность **не установлены**. Сравнение из commerce research ограничено официальными заявлениями:

| Product | Observed positioning | N8 distinction / limitation |
|---|---|---|
| [Interior AI](https://interiorai.com/) | Photo redesign/style/staging | N8 выбран как измеренная сцена→локальная закупка; российский каталог конкурента не подтверждён |
| [REimagineHome](https://www.reimaginehome.ai/) | Visual iteration/real products/cart messaging | Не доказан Moscow/region/store procurement; маркетинг не quality eval |
| [HomeDesignsAI](https://homedesigns.ai/) | Style/material changes/cost estimator | Упаковки/локальная доставка и точная геометрия требуют отдельной проверки |

## Technology Assessment and User Insights

N6 auth/payment/upload, N4 leased jobs и N5 S3 дают конкретные доноры; их область ответственности уже отделена интерфейсами. Выбран PostgreSQL job path из оригинального scope с N4 fencing, не новая очередь. Domain geometry/budget связи отсутствуют у доноров и допускают новый ограниченный модуль после feature reuse sweep.
Gemini `google/gemini-4-argon` — кандидат из проверенного model catalogue; `google/gemini-2.5-pro` — candidate fallback, `google/gemini-3-pro-image` — поздний концепт-кандидат. Нет доказательства «лучший», скорости/стоимости одного результата, точной AI-геометрии. Текущий MVP live request text-only; выбор style/refs вручную уже полезен. Мультимодальность откладывается до bounded-cost/rights eval.
Реальных user interviews/VoC/конверсии нет. JTBD и эмоции — явно [H] в discovery. Выбор A — прямое решение владельца, не результат A/B-теста.

## Confidence and Research Path Log

Высокая уверенность в факте чтения текущих API docs и наблюдённых 401; средняя в пригодности donor contracts после адаптации; низкая/unknown в user demand, physical scan accuracy, AI quality/cost. Не сводить эти разные факты в фиктивный общий процент.
1. Prefilled canonical/spatial/commerce/reuse пакет прочитан; прежний dimension-after-design совет не принят.
2. Последующее owner решение выбрало A, сняло approval wait; обновлённый input прочитан.
3. Обычный браузерный addendum ограничил retail auto-path → manual MVP.
4. Проверены OpenRouter schema/completion/spend и ЮKassa create/webhook primary docs; guessed URL в одном обращении не разрешился, исправлен по официальной навигации.
5. `dz recall` canonical brain по security/geometry/budget/anti-drift и narrow review query: exit 0, matching patterns отсутствуют; уроки не выдуманы.
6. Live inference/payment запросов, CAPTCHA/proxy обхода и публикации не было. Следующие gaps — реальные fixtures, per-feature reuse refresh, audit/contract tests, independent validation.
