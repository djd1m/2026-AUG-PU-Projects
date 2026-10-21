# Реестр переиспользования N8 — предварительный

Источник локального дерева: `3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4`, просмотр 2026-10-13. Это анализ исходников, не результат запуска донорских тестов.

## Поиск проектов 1–7

Просмотрены каталоги 01, 02, 03, 03a, 04, 05, 05a, 06 и 07. Проект 07 содержит только README: исполняемого донора в этой копии нет. Исходный N8 также не содержит приложения.

| Возможность | Файл | SHA-256 | Решение | Граница |
|---|---|---|---|---|
| HTML CJM | `projects/06-rag-sales-chatbase/docs/discovery/cjm-prototype.html` | `87782422b96e46dd2f1cdaa220a0291e7f3715ed263699bf5b899b9381cde54a` | adapt | Навигация по шагам, заметки CJM, маркировка демо; продуктовый текст и визуальный стиль заменить. |
| HTML CJM | `projects/05a-podcast-clips-opus/docs/CJM_Variants.html` | `1a704cc65e98528754b88b4173996a5ff7c056a0e28efd999fc5c86d85ef143b` | adapt | Переключение вариантов, клавиатура, сравнение, отделение выбора в макете от approval. |
| Auth | `projects/06-rag-sales-chatbase/apps/web/src/server/auth.ts` | `999f6c8969e418c95310f7325a4b87f1730a599415b2d9e8d49622385229ab3e` | adapt | AuthStore отделён от сервиса; убрать партнёрские условия и проверить политики сессий N8. |
| Auth | `projects/03a-affiliate-rewardful/apps/web/src/lib/auth/session.ts` | `dd8d3ff1482794d4a358da4464168b37f0d064db4293d603c1d3674c3671a262` | adapt | Хэширование/отзыв сессий; program-scoped Membership не переносить в проекты ремонта. |
| Payments | `projects/06-rag-sales-chatbase/apps/web/src/server/payments/provider.ts` | `c303bd3206b2e6209596d1469fbd1f236569c7ccc58f3869d66479b8fae64623` | adapt | PaymentProvider контракт, деньги в копейках, typed errors; нужна модель заказа N8 и idempotency tests. |
| Jobs | `projects/06-rag-sales-chatbase/packages/queue/src/queues.ts` | `e6081ab436cd1bec65f475afa30aef4aa19544d07eb16f281cc4c1a29e477e4e` | adapt | BullMQ enqueue, идентичность задания/поколения; заменить index job семантику и отдельно выбрать Postgres-only vs Redis. |
| Storage | `projects/05-podcast-clips-opus/packages/s3/src/index.ts` | `50ebf509561e0bcf45b51288616443b9ab1989b764ea63dad088da8d011afb62` | adapt | SDK и обёртки S3; лимиты, MIME, доступ к планам и права должны быть N8-specific. |
| Dashboard | `projects/06-rag-sales-chatbase/apps/web/src/app/dashboard/page.tsx` | `be702c4227fa2b290b72ebef4e7d72b08029b6dcf3b02334f64a6c3f4e1e91b2` | adapt | Состояния загрузки/кабинет; нельзя копировать сущности chatbot и quotas. |
| Partner later | `projects/04-calorie-vision-cal-ai/apps/api/src/partner/activate-attribution.ts` | `60fadb6d5e959aacbe12bfb16035e56c6fb554a98d8e255a07f2231b04ce07f8` | defer | Изучить при фактическом запуске партнёрки; не часть первого сегмента. |

## Обязательный второй поиск: GitHub

Выполнен после локального поиска. Кандидаты, не установленные в продукт и не финальный выбор архитектуры:

| Область | Репозиторий | Лицензия по источнику | Решение сейчас |
|---|---|---|---|
| 3D import/viewer | https://github.com/mrdoob/three.js | MIT | Кандидат для scene graph и loaders; не писать свой WebGL renderer |
| GLB viewer | https://github.com/google/model-viewer | Apache-2.0 | Кандидат для просмотра; не заменяет редактор комнаты |
| Auth | https://github.com/better-auth/better-auth | MIT | Сравнить с существующими локальными модулями при фиче auth; миграция без пользы не нужна |
| Очереди | https://github.com/taskforcesh/bullmq | MIT | Уже есть локальные адаптеры N5/N6; не писать собственную очередь без причины |
| S3 | https://github.com/aws/aws-sdk-js-v3 | Apache-2.0 | Использовать SDK через локальный адаптер, не самописный клиент |
| Browser checks | https://github.com/microsoft/playwright | Apache-2.0 | Использовать существующий подход N6 к отдельному прибору; tooling только /tmp |

Поиск универсального standalone wizard не дал подтверждённого подходящего кандидата за ограниченный проход; локальные CJM N5a/N6 ближе к задаче. Новый контент и специфичные взаимодействия N8 неизбежны, но навигацию, состояния и приёмы проверок адаптируем. Новая зависимость для простого HTML не оправдана.

## Контракт перед каждой будущей фичей

Этот реестр не заменяет обязательный поиск перед конкретной фичей. Переоткрыть выбранный модуль и его тесты, зафиксировать текущий hash/commit, провести локальный поиск и GitHub-поиск, проверить контракт/лицензию/зависимости. Только затем reuse/adapt/new. Для локального кода отдельная LICENSE в корне не найдена: внутреннее reuse разрешено владельцем, право внешнего распространения не доказано.

Историческая подготовка не копировала приложение и предполагала остановку на выборе CJM. Последующее разрешение владельца выбрало A и отменило остановку; далее выполняется per-feature reuse перед полной реализацией. Партнёрка с магазинами deferred. После реализации каждой фичи обязателен отдельный anti-drift к согласованным FR/NFR/AC/ADR.

## Проверки для переноса

Auth: отзыв/expiry/session isolation/CSRF; payments: verification, replay, rollback при provider unavailable; jobs: retry/fencing/quota cancellation; storage: upload bounds, object access, MIME and untrusted inputs. Зелёные донорские отчёты не являются проверкой N8.
