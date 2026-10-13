# Состояние проектов и состав main

Сверка исходников и документов: **2026-10-13 UTC**. Это сводка последних сохранённых доказательств, а не новая проверка работающих стендов. Дата каждого продуктового результата указана отдельно. Наличие кода и успешных локальных тестов не подтверждает реальные платежи, отправку почты или качество генерации.

`main` создана владельцем на основе `3b84e9ef`, затем дополнена текущими основными ветками. История сохранена, force push не применяется. Старые запреты «не создавать main» в документах стадий относятся к прежним разрешениям; явное поручение владельца от13.10 разрешает эту интеграцию. Оно не разрешает deployment, новые расходы или реальные provider calls.

## Основные проекты

| Проект | Реализовано / последняя записанная проверка | Ограничения и следующий шаг | Доказательства |
|---|---|---|---|
| **01 Proofwall** | MVP и последующие фичи; документирован стенд proofwall.aicoding.space и исправление password reset28.09; сверка29.09 | Resend не настроен, видео выключено; потолок расходов и часть внешних auth/payment/bridge проверок не закрыты. Проверить настройку и actual E2E до заявления о готовности | [Completion](../projects/01-testimonials-senja/docs/Completion.md), [README](../projects/01-testimonials-senja/README.md) |
| **02 ReviewQR** | MVP, Telegram, TEST-оплата; документирован reviewqr.aicoding.space и выпуск исправления guest-IP28.09 | Реальный магазин выключен; account handoff остаётся планом, телефонные диплинки блокируют пилот | [README](../projects/02-review-qr-reputation/README.md), [guest-IP receipt](../projects/02-review-qr-reputation/docs/features/guest-ip-forwarding/05_completion.md) |
| **03 Круг** | F1 синтетически принят; F2 identity/MCP/A2A и referral funnel; документирован выпуск29.09 на reward.aicoding.space | Access-onboarding незавершён; README предупреждает о rebuild HEAD с ненастроенной почтой. Main сохраняет этот незавершённый контур и добавляет пропущенный исходник лимита demo400 из release-линии; main не объявляется готовым deployment image | [Completion](../projects/03-affiliate-rewardful/docs/Completion.md), [operations](../projects/03-affiliate-rewardful/docs/f2-operations.md), [README](../projects/03-affiliate-rewardful/README.md) |
| **04 Тарелка** |11 фич; документирован tarelka.aicoding.space. Квитанция29.09:548 unit/guard+1skip,349 integration | Реальная оплата не принята; webhook/long-job contracts имеют незакрытые проверки; live Telegram не подтверждён | [Completion](../projects/04-calorie-vision-cal-ai/docs/Completion.md), [README](../projects/04-calorie-vision-cal-ai/README.md) |
| **05 КлипМейкер** |30 фич; документирован clipmkr.ru. Квитанция29.09:1048/1048 в тестовом образе | Платёжный код есть, но магазин/режим выключен; VK/Rutube ingest и Telegram не реализованы. Старые доменные/регистрационные предупреждения требуют отдельной актуальной проверки | [Completion](../projects/05-podcast-clips-opus/docs/Completion.md), [README](../projects/05-podcast-clips-opus/README.md) |
| **06 Суфлёр** |17/17 фич и последующие исправления; документирован sufler.aicoding.space, внешний бот28.09. Сохранены1094 теста в образе и673 browser checks | Собственный live-магазин YooKassa ждёт настройки владельца; последующие решения о тарифе/лимите включены из основной ветки | [Completion](../projects/06-rag-sales-chatbase/docs/Completion.md), [README](../projects/06-rag-sales-chatbase/README.md) |
| **06b RAG-бот для сайта** |Включена более полная release-линия:15/16 done; есть страницы/PDF, индексация, RAG, виджет, демо, badge/referral, studio subaccounts, metrics/source management. F16 offline инструменты подготовлены | Release gate не принят: калибровка NOT_EXECUTED, actual внешний стенд/E2E/rollback и требуемые контракты остаются pending. Не считать опубликованным продуктом | [Roadmap](../projects/06b-rag-class/.claude/feature-roadmap.json), [F16 completion](../projects/06b-rag-class/docs/features/release-gate/05_completion.md), [calibration](../projects/06b-rag-class/docs/calibration-report.md) |
| **07 Когорта / cold email** |Локальный MVP и F07–F10 приняты; LIVE runtime развёрнут07.10. Запись08.10 фиксирует SMTP/IMAP authority и сетевую диагностику. Добавлен исследовательский пакет внешнего транспорта и хостинга |Последняя записанная попытка: provider_backoff и timeout доTLS/AUTH, свежего полного IMAP-опроса нет. Выданный grant истёк09.10; успешная отправка/доставка не доказана. Billing disabled до merchant keys, расширенные F11+ и требование AI-ответа≤5мин не приняты полностью | [Activation evidence](../projects/07-cold-email-warmup/docs/telemetry/exports/20261008-n7-live-transport-activation/README.md), [deployment evidence](../projects/07-cold-email-warmup/docs/telemetry/exports/20261007-n7-live-deployment/README.md), [expanded plan](../projects/07-cold-email-warmup/docs/plans/expanded-mvp-plan.md), [provider research](../projects/07-cold-email-warmup/docs/research/external-mail-infrastructure-20261008/README.md) |
| **08 RoomKind** |Локальный software scope F07 Replicate принят03.10: actual52+2 browser,23таблицы/521строка restore и28private files. Hosted adapter присутствует; локальныйGPU не обязателен для этого режима |Hosted по умолчанию disabled, внешний расход0. Реальный Replicate pilot, quality/geometry corpus,≥30warm samples/p95≤25с, provider/billing/privacy/license gates и внешний выпуск не приняты. Это не полный production MVP | [F07 acceptance](../projects/08-interior-ai-redesign/docs/features/f07-replicate/local-acceptance.md), [Completion](../projects/08-interior-ai-redesign/docs/Completion.md), [walkthrough](../projects/08-interior-ai-redesign/docs/pipeline-walkthrough.md) |

Записанные URL — адреса ранее описанных стендов, а не результаты HTTP/browser проверки13.10. Счётчики тестов относятся к своим историческим source/build receipts; они не складываются в результат нового общего regression run.

## Другие варианты и отдельные репозитории

- **03a:** работа приостановлена владельцем10.09. Foundation/identity/program/partner приняты; tracking, продажи, начисления/self-service и real external E2E не завершены. [README](../projects/03a-affiliate-rewardful/README.md), [Completion](../projects/03a-affiliate-rewardful/docs/Completion.md).
- **05a:** Phase1/2 и toolkit готовы; реализация ещё не начиналась, первая фича stt-probe. [README](../projects/05a-podcast-clips-opus/README.md).
- **Альтернативный N7 «Грелка»:** отдельная ветка `kilocode-07-cold-email-warmup-replicate`, commit2357faa6 от07.10; её README фиксирует29 unit и12 smoke для другой реализации/PGlite/in-process queue. Не заменяет текущий SMTP/IMAP продукт; root apps/packages и альтернативная документация в main не смешиваются. [Полная ветка](https://github.com/djd1m/2026-AUG-PU-Projects/tree/kilocode-07-cold-email-warmup-replicate). Выбор единого продукта требует отдельного архитектурного решения.
- **promo-video-harness:** отдельный [репозиторий](https://github.com/djd1m/promo-video-harness), не входит в этот merge. Его актуальное состояние13.10 отдельно не проверялось. Производство новых course promo videos было приостановлено владельцем; интеграция main его не возобновляет.
- **SVG heroes:** опубликованные assets и доказательства01–03 включены. Локальные04–08 в этот перенос не входят: отдельного разрешения публикации этого набора пока нет.
- **DRP:** находится в другом репозитории [aicoding-site](https://github.com/djd1m/aicoding-site/tree/course-promos-server-handoff-20261004/DRP). Не является автоматически проверенным планом восстановления всехN1–N8; содержимое не переносится из частичной недоступной копии.

## Какие источники объединены

| Источник | Зафиксированная ревизия | Что включено |
|---|---|---|
| owner-created origin/main = claude/install-npm-packages-n7l3m5 |3b84e9ef|Основные проекты01–06,03a/05a, общий toolkit и решения владельца |
| feature/06b-rag-class |732df4cc|История06b, экономная политика моделей и общие согласованные документы |
| feature/06b-release-gate |6c08f034|Более полная реализация06b,15/16 roadmap и pending F16 gates |
| feature/07-cold-email-warmup |c7bd1820|Текущий N7: код, документация, телеметрия и исследование инфраструктуры |
| feature/08-interior-ai |bf40df86|Текущий N8 с hosted Replicate software scope и доказательствами локальной приёмки |
| published hero commit |445fc3d8|ОпубликованныеSVG01–03 и их source-bound доказательства |
| local n3/reward-domain commit |38bed68a|Пропущенный demo-limit source/test; conflict resolution сохраняет более новыйaccessConfig |

Три старых payment/referral commits из `codex/n3-proofwall-release` уже patch-equivalent в основном дереве; повторное включение не нужно. Незакоммиченная телеметрия/авторские попытки N7 и локальные .dz/__pycache__ не публикуются как принятый результат. Исторические отчёты сохранены; эта сводка указывает более позднюю квитанцию при противоречии старому README.

## Проверки этой интеграции

- История main сохраняет исходную main владельца; обычные merge commits и узкие cherry-picks, без force push.
- Проверяется совпадение production source N6b/N7/N8 с зафиксированными донорами; документационные дополнения перечислены отдельно.
- Единственный конфликт кода N3: два участка server.mjs, сохранены accessConfig и donor maxDemoRuns. Node22.22.0 candidate build:141module syntax/import checks,4functional entries; demo-limit tests4/4. Использован уже существующий образ, readonly source mounts, network none, без портов/БД/реальных provider calls.
- Локальные ссылки новых документов и отсутствие code conflict markers прошли проверку. Secret scan:7 false positives (URL, embedded raster bytes, явная dummy fixture), реальные ключи не найдены; tracked .env отсутствуют. `git diff --check` новых ручных изменений PASS; полный diff от исходной main выявляет унаследованные whitespace-ошибки vendor/telemetry файлов, которые сохранены без переформатирования ради привязки исторических доказательств. Независимое ревью получает план, донорские ревизии и итоговый diff, без контекста автора.
- Полная новая сборка/DB/browser E2E всех проектов и проверка живых стендов не выполнялись; историческая приёмка остаётся привязанной к прежнему source/build. На hostNode20 новый product build не заявляется: N3 check исполнялся через имеющийсяNode22 image.

Профиль **model-routing-econom**: запрошены Sol6.1/high для аудита/ревью и Sol6.1/medium для разрешения кода. Actual runtime model IDs, токены и цена недоступны и отражены null. Прогон и проверки: [integration run](development/telemetry/main-integration-20261013/run.json). Это поставка исходников и статусов, а не новый deployment.
