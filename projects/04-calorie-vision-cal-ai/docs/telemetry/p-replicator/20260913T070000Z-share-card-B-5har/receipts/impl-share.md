# Квитанция: share-card-and-growth-events — продолжение после гибели сессии в 07:54 UTC

## Ревизия унаследованных 12 незакоммиченных файлов (первый шаг)

| Файл | Состояние на момент старта | Что сделано в этой сессии |
|---|---|---|
| `packages/db/migrations/007_share_card_and_growth_events.sql` | готово | без изменений |
| `packages/shared/src/domain/share-card.ts` | готово | без изменений |
| `packages/shared/src/text/sanitize-for-card-text.ts` | готово | без изменений |
| `apps/api/src/growth/record-growth-event.ts` | готово | без изменений |
| `apps/api/src/share/build-card-payload.ts` | готово | без изменений |
| `apps/api/src/share/render-card-image.ts` | готово | без изменений |
| `apps/api/src/share/read-recognition-snapshot.ts` | готово | без изменений |
| `apps/api/src/share/share-card-repository.ts` | готово (FR-9 реализован корректно) | без изменений |
| `apps/api/src/share/create-share-card.ts` | **наполовину** — рендерил и заливал в бакет JPEG с полным составом блюда БЕЗУСЛОВНО, до проверки согласия (нарушение DEC-A-034) | добавлена дешёвая предварительная проверка согласия ДО рендера/фетча/заливки |
| `apps/api/src/routes/share-cards.ts` (маршрут 5) | написан, **не начат** — не зарегистрирован в `server.ts`, мёртвый код | зарегистрирован |
| `apps/api/src/photo/store-original.ts` (presignedGetUrl) | готово | без изменений |
| маршрут 6 (`GET /c/{card_id}`) | **не начат** — ни файла, ни строки кода | реализован полностью (см. ниже) |

## Найденный и исправленный дефект: DEC-A-034 (отложенная сборка)

`create-share-card.ts` вызывал `renderCardImage` (сеть + `sharp`, полный состав блюда — ккал,
белки, жиры, углеводы, название) и `storage.putOriginal` **до** какой-либо проверки согласия —
консент проверялся только внутри `createShareCardGuarded`, ПОСЛЕ того как артефакт уже лежал в
бакете. Для первого анонимного скана без согласия (типичный случай, E14/AC-2) это означало: JPEG
с данными о питании персистентно создаётся в хранилище независимо от исхода согласия — прямое
нарушение DEC-A-034 («владелец может разрешить сборку карточки до согласия, ЕСЛИ карточка не
несёт данных о питании вовсе» — здесь несёт).

Исправление: дешёвая, НЕ авторитетная проверка `enforceConsentBeforeDiaryWrite` добавлена сразу
после проверки идемпотентности, ДО чтения Snapshot/фетча фото/рендера. Атомарная защита от гонки
с отзывом (FR-9, `createShareCardGuarded`) не менялась — она была реализована верно с самого
начала (лок `FOR UPDATE` первым оператором, `ON CONFLICT DO NOTHING`, чтение существующей строки
внутри той же транзакции при проигранной гонке).

## Маршрут 6 — реализация и осознанные отклонения от `03_architecture.md`

Архитектурный документ называет `apps/web/app/c/[cardId]/page.tsx` и прямую presigned-ссылку в
`<img src>`. Реализовано иначе, обе причины названы явно в коде:

1. **Route Handler (`route.ts`), не `page.tsx`.** AC-8 требует `Cache-Control: no-store` на ОБЕИХ
   ветках (200/404) ОДНИМ местом кода. У `page.tsx` + `notFound()` в Next.js App Router нет
   единой точки для установки заголовка на ветке `notFound` — риск ровно того стража, что назван
   в `04_refinement.md` («продублировать в двух местах и убрать из одной»).
2. **Изображение не отдаётся презентигнутой ссылкой на MinIO.** MinIO не публикуется за пределы
   сети compose (`docker-ports.md`, Правило №0) — presigned-URL на `minio:9000` физически
   недостижим из браузера зрителя. То же требует CSP `img-src 'self'` (`middleware.ts`). Решение:
   `api` стримит байты САМ (`GET /internal/share-cards/:cardId/image`, читает presigned-URL
   внутри сети compose и проксирует тело ответа), `web` проксирует их дальше под своим origin
   (`/c/{card_id}/image`). Секреты S3 остаются только у `api`.
3. **Отдельный маршрут для байт картинки, не JSON с presigned-URL.** Браузер запрашивает
   `<img src>` ОТДЕЛЬНЫМ HTTP-запросом от HTML — если оба запроса писали бы `growth_event
   (card_view)`, счётчик удвоился бы на каждый реальный просмотр (AC-10 требует ровно одну
   строку на открытие). Запись события живёт ТОЛЬКО в маршруте метаданных.
4. **Внутренний API-эндпоинт вне `/api/v1` и вне `Caddyfile`.** Канон фиксирует «ровно 14
   маршрутов /api/v1»; `Caddyfile` проксирует наружу только `/api/*` и `/health`. Путь
   `/internal/share-cards/*` физически недостижим извне — вызывается только `web` изнутри сети
   compose (`API_INTERNAL_URL = http://api:3000`).

## Новый файл конфигурации: `apps/web/env.ts`

До этой фичи `apps/web` не читал `process.env` вовсе. Маршрут 6 первым потребовал
`API_INTERNAL_URL` — добавлен `apps/web/env.ts` (ЕДИНСТВЕННОЕ место чтения, по образцу
`apps/api/src/env.ts`/`apps/recognizer/src/env.ts`), иначе прямое чтение `process.env` в
route-файлах красило бы «страж чтения окружения» (`tests/unit/source-guards.test.ts`), ожидающий
ровно один читающий файл на сервис. Ожидаемый список файлов стража обновлён.

## Побочная правка сиблинг-фич: миграция 007 сделала строже

`UNIQUE (recognition_id)` на `share_card` (AC-16) отбила фикстуры ДВУХ тестов сиблинг-фичи
(`tests/integration/account-delete.test.ts`, `tests/integration/erasure-job.test.ts`), которые
заводили по НЕСКОЛЬКО карточек на ОДИН `recognition_id` — до миграции это было возможно случайно,
продовый код уже предполагал обратное. Обе фикстуры переведены на «одна `recognition` на
карточку»; поведенческая логика тестов (что именно проверяется) не менялась.

## Тесты — таблица покрытия

| AC | Файл | Заголовок |
|---|---|---|
| AC-1 | `tests/integration/share-cards-route.test.ts` | завершённый скан со Snapshot даёт карточку с ровно четырьмя числами и без данных здоровья |
| AC-2 | `tests/integration/share-cards-route.test.ts` | DEC-A-034: анонимная сессия без согласия — 403, карточка не создаётся; после grant — создаётся |
| AC-3 | `tests/integration/share-cards-route.test.ts` | queued/failed/refused дают 409, карточка не создана |
| AC-4 | `tests/unit/build-card-payload.test.ts` | пять неопознанных значений тарифа дают бейдж |
| AC-5 | `tests/unit/build-card-payload.test.ts` | ровно paid снимает бейдж |
| AC-6 | `tests/integration/share-cards-route.test.ts` | повторный вызов — та же карточка; чужой recognition_id — 404 |
| AC-7 | `tests/integration/public-card-page.test.ts` | удалённая/неизвестная/невалидная карточки — один и тот же 404 |
| AC-8 | `tests/integration/public-card-page.test.ts` | no-store на успехе и на всех вариантах 404 |
| AC-9 | `tests/integration/public-card-page.test.ts` | отзыв между двумя запросами — второй 404, живая проверка (HTML и картинка) |
| AC-10 | `tests/integration/public-card-page.test.ts` | card_view от имени владельца, без cookie/IP зрителя |
| AC-11 | `tests/integration/share-cards-route.test.ts` | share_click считает клики, не карточки; три вызова — три события, одна карточка; 404 не считается |
| AC-12 | `tests/concurrency/share-card-consent-race.test.ts` | E8 барьером против реального createShareCardGuarded (10 повторов); E7 — переиспользован `account-delete.test.ts` RV-03 (см. комментарий файла) |
| AC-13 | `tests/unit/sanitize-for-card-text.test.ts` | bidi + HTML-инъекция не проходят ни на одну поверхность |
| AC-14 | `tests/unit/share-card-field-set-guard.test.ts` | множество полей ровно из восьми, испытано двумя внедрёнными дефектами |
| AC-15 | `tests/unit/build-card-payload.test.ts` | лишнее поле не попадает в результат, испытано мутантом-спредом |
| AC-16 | `tests/integration/migrations.test.ts` | UNIQUE(recognition_id) существует и отбивает вторую строку на уровне базы |
| AC-17 | `tests/concurrency/share-card-idempotency.test.ts` | 20 одновременных createShareCardGuarded — одна строка, один card_id |
| AC-18 | `tests/integration/share-cards-route.test.ts` | ModelProvider не вызван, scan_quota_counter не изменён |

## Не сделано / известные пробелы

- **`apps/web`** не объявляет `@n4/shared` зависимостью — `escapeHtml` продублирован узко в
  `apps/web/app/c/[cardId]/route.ts` (5 строк, с комментарием-обоснованием) вместо импорта.
  Правка `package.json`/`package-lock.json` оставлена координатору слияния.
- **Клиентский фоновый вызов** `POST /api/v1/share-cards` по получении `done` (экран результата,
  владеет `scan-pipeline`) не добавлен — это явно вне объёма файлов этой фичи
  (`03_architecture.md`, «Зависимости от соседних фич»), координатор сводит при слиянии.
- **check-look-trace / check-growth-trace и подобные хуки** не запускались отдельно — вне списка,
  переданного лидом.

## Прогоны

- `npm test` (unit) — 167/167 зелёных.
- `npm run typecheck` — чисто.
- `npm run lint` — чисто.
- `npm run build` — все пять пакетов, включая `next build`, чисто.
- `docker compose --profile test run --rm -T test sh -lc 'npm run test:integration'` — три
  прогона подряд (38/38 файлов; 155 → 155 → 156 тестов, рост на 1 — добавлен AC-11).
  `docker compose --profile test down -v` выполнен после каждого прогона.
- `node .claude/hooks/check-ports.cjs .` — 0.
- `bash scripts/check-port-conflicts.sh .` — 0.
- `bash scripts/check-env-wiring.sh .` — 0 (api/recognizer/web).
- `bash scripts/check-pipeline-gaps.sh . --completion --role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md` —
  найденные ❌/⚠️ (managed-BaaS упоминание, трассировка FR-LOOK/ADR, 4 `[GAP]`) проверены вручную:
  все относятся к `docs/telemetry/.../evidence/*.log` (пред-существующие логи прошлой фазы) и к
  `docs/features/consent-and-telegram-auth/05_completion.md` — ни одного упоминания
  `share-card-and-growth-events`. Контур этой фичи чист.

Status: completed
