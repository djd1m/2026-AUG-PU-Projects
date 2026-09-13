# Фича `share-card-and-growth-events` — архитектура

## Размещение по пакетам и сервисам

Ни одного нового сервиса compose — фича живёт в двух уже существующих (`api`, `web`):

```
packages/shared/src/domain/share-card.ts        ShareCardRenderInput, ALLOWED_SHARE_CARD_FIELDS
packages/shared/src/text/sanitize-for-card-text.ts   sanitizeForCardText
apps/api/src/share/build-card-payload.ts        BuildCardPayload
apps/api/src/share/render-card-image.ts         RenderCardImage (sharp + SVG)
apps/api/src/share/create-share-card.ts         CreateShareCard (транзакция, блокировка, INSERT)
apps/api/src/routes/share-cards.ts              POST /api/v1/share-cards
apps/api/src/growth/record-growth-event.ts      RecordCardView / RecordShareClick (общий insert)
apps/web/src/app/c/[cardId]/page.tsx            RenderPublicCardPage (SSR, маршрут 6)
```

`apps/recognizer` НЕ трогается: автоматический пре-варминг карточки запускается КЛИЕНТОМ (`apps/web`,
экран результата) фоновым вызовом `POST /api/v1/share-cards` сразу по получении `status: done` от
`GET /api/v1/scans/{id}`, а не сервером изнутри `apps/recognizer`. Это осознанный выбор границы файлов
(см. «Зависимости от соседних фич» ниже), а не случайность размещения.

## Изменения схемы

**Одна миграция, одно изменение, новой таблицы нет.**

```sql
-- packages/db/migrations/<следующий свободный>_share_card_recognition_unique.sql
-- Номер подтверждается при реализации сверкой с фактическим состоянием каталога `migrations/`
-- (на 2026-09-13 существуют 001 и ДВА разных файла 002 из параллельных worktree — координатор
-- решает нумерацию при слиянии; здесь называется ТОЛЬКО содержимое).
ALTER TABLE share_card
  ADD CONSTRAINT share_card_recognition_id_unique UNIQUE (recognition_id);
```

Обоснование: `FR-share-card-and-growth-events-4` требует идемпотентности «одна карточка на скан»,
которую до сих пор в схеме `foundation` (`001_init.sql:181-192`) обеспечивать было нечем — там есть
только `FOREIGN KEY (recognition_id) REFERENCES recognition(id)` без уникальности. Уникальность и
потолки обеспечивает БАЗА, а не код (`.claude/rules/coding-style.md`).

`growth_event` (`001_init.sql:265-273`) и `share_card.revoked_at` не меняются — обе колонки уже
существуют и уже нужного типа.

## Структура каталогов (добавления)

```
apps/api/src/share/
  build-card-payload.ts
  render-card-image.ts
  create-share-card.ts
apps/api/src/growth/
  record-growth-event.ts
apps/api/src/routes/
  share-cards.ts
apps/web/src/app/c/[cardId]/
  page.tsx
packages/shared/src/domain/
  share-card.ts
packages/shared/src/text/
  sanitize-for-card-text.ts
```

Тесты — `tests/unit/{sanitize-for-card-text,build-card-payload}.test.ts`,
`tests/integration/{share-cards-route,public-card-page,growth-events}.test.ts`,
`tests/concurrency/{share-card-idempotency,share-card-consent-race}.test.ts`,
`tests/guard/share-card-field-set.test.ts`.

## Зависимости npm (добавления)

**НОЛЬ новых пакетов.** `sharp` уже зависимость проекта (упомянута `coding-style.md` «известные
грабли стека»; используется `apps/recognizer` для нормализации HEIC). Композиция SVG-поверх-фото
через `sharp().composite()` — стандартная возможность уже установленной библиотеки, отдельного
рендерера canvas/headless-браузера не заводится: он был бы новой внешней зависимостью ради того, что
`sharp` уже умеет.

## External Dependencies

| Что | Роль | Проверка способности |
|---|---|---|
| `sharp` (уже в проекте) | композиция SVG-текста поверх JPEG/PNG, вывод 1080×1920 | ПОДТВЕРЖДЕНО косвенно: `foundation`/`scan-pipeline` уже используют `sharp` для нормализации HEIC на этом же образе; способность к `.composite()` — стандартная документированная функция той же версии, отдельной проверки первоисточника не требуется, т.к. это не новая зависимость |
| MinIO (уже в проекте, ADR-010) | приватный бакет `share-cards/<recognition_id>.jpg`, presigned GET TTL 15 мин | ПОДТВЕРЖДЕНО: `foundation`/`scan-pipeline` уже минтят presigned-URL тем же клиентом для фото |

Оба пункта — переиспользование уже подтверждённых способностей соседних фич, новых внешних
источников для проверки первоисточником нет.

## Переменные окружения

Новых переменных окружения фича не вводит. `S3_*` (уже обязательны, `foundation`) покрывают и новый
префикс объектов `share-cards/`. TTL presigned-URL — литерал 15 минут, тот же, что уже действует для
фото владельца (не новая настраиваемая величина: см. `coding-style.md` — порог эскалации 0,6 тоже
литерал канона, а не переменная).

## Зависимости от соседних фич

**`source-and-correct` (обязательная, объявлена роадмапом).** `Snapshot` и реальный `food_item_id`
должны существовать к моменту `done` — до неё `apps/recognizer` использует `NullMatchIngredientPort`
(DEC-A-014) и `done` НЕДОСТИЖИМ вовсе (см. `docs/features/scan-pipeline/01_specification.md`,
«Стык с `source-and-correct`»); Phase 3 ЭТОЙ фичи не имеет смысла начинать раньше.

**`consent-and-telegram-auth` (найденная, не объявленная роадмапом — см. `01_specification.md`,
«Зависимости и предусловие»).** `CreateShareCard` вызывает её границу
`EnforceConsentBeforeDiaryWrite` КАК ИНТЕРФЕЙС: `(owner_row_kind: 'account'|'device_session',
owner_row_id) → { consentAt: Timestamp | null }`, ПЕРЕИСПОЛЬЗУЯ её способ определения владельца
(шаг 1 их `EnforceConsentBeforeDiaryWrite`: аккаунт, если сессия связана, иначе сама сессия), а не
запрашивая отдельное решение `granted|refused` — потому что этой фиче нужно ЗНАЧЕНИЕ `consent_at`
внутри СВОЕЙ блокировки (`FOR UPDATE`), а не готовый булев ответ чужой функции, вызванной ДО
блокировки (это и была бы гонка «Стык 2»). Если `consent-and-telegram-auth` к моменту реализации
предоставляет только готовую функцию `granted|refused` без доступа к сырому значению под своей же
блокировкой — Phase 3 этой фичи оборачивает ЧТЕНИЕ `consent_at` САМОСТОЯТЕЛЬНО (SQL, не вызов чужой
функции) под СВОЕЙ `FOR UPDATE`, и это ЗАКОННО: обе фичи читают ОДНУ И ТУ ЖЕ колонку одной и той же
таблицы, интерфейс — это имя колонки и таблицы (`account.consent_at` /
`device_session.consent_at`), а не обязательно общая функция.

**`scan-pipeline` (обязательная, косвенная).** `apps/recognizer/src/recognize/recognize-scan.ts` уже
существует (реализация в процессе) и НЕ трогается этой фичей. Единственная точка соприкосновения —
клиентский код экрана результата (`apps/web`, файл владеет `scan-pipeline`): требуется ОДНА строка —
фоновый вызов `POST /api/v1/share-cards` по получении `done`. Именуется здесь явно, чтобы координатор
свёл это при слиянии, а не пропустил (`swarm-file-evidence.md`).

**`partner-codes-and-cabinet` (не зависимость, потребитель).** Читает `growth_event` этой фичи
(`card_view`, `share_click`) по `partner_code_id` для кабинета партнёра (FR-PARTNER-002); эта фича
ничего не знает о существовании кабинета и не должна меняться, если он изменится.

## Границы, которые фича обязана сохранить

- **Число не берётся второй раз из `model_estimate_kcal`.** `BuildCardPayload` читает ГОТОВЫЙ
  Snapshot, не пересчитывает и не трогает эскалацию/уверенность (ADR-001).
- **Никакой публикации бакета.** Presigned-URL — единственный путь к объекту карточки, как и к фото
  (ADR-010); `db`/`storage` без публикации портов (`docker-ports.md`) не меняется этой фичей.
- **`web` без секретов вызова наружу.** SSR-страница `/c/{card_id}` минтит presigned-URL ЧЕРЕЗ `api`
  (внутренний вызов в сети compose, не напрямую из `web` к MinIO своими ключами) — секреты S3
  остаются только у `api`/`recognizer` (`secrets-management.md`, таблица секретов не меняется).
- **CORS не настраивается.** `/c/{card_id}` живёт на том же origin за тем же Caddy, второго
  заголовка `Access-Control-Allow-Origin` не добавляется ни в `web`, ни в `Caddyfile`
  (уже верно для всего проекта, `deployment-seams.md`).
- **`Cache-Control: no-store` на `/c/*` уже стоит в `Caddyfile` (строки 63-64, проверено чтением
  файла 2026-09-13) — фича НЕ добавляет его повторно на уровне прокси; она обязана поставить ЕГО ЖЕ
  на уровне приложения (шаг 6 `RenderPublicCardPage`), потому что двойной одинаковый заголовок от
  ДВУХ мест не ломает `Cache-Control` так же, как ломает `CORS` (заголовки кэширования комбинируются,
  а не конфликтуют) — но полагаться только на прокси нельзя: `web` рендерит страницу и обязан сам
  объявить свою политику независимо от того, что стоит перед ним.**
