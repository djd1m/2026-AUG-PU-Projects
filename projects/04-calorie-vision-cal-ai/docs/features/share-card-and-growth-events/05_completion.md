# Фича `share-card-and-growth-events` — завершение: порядок работ, команды, покрытие критериев

## Статус документа

Написан в Phase 1 (PLAN), режим скорости DEC-A-032. Таблица `## Criterion coverage` — ПЛАНОВАЯ:
пути файлов и заголовки тестов ожидаемые, не фактические. Phase 3 заменяет их тем, что действительно
написано, и только тогда ворота `--completion` имеют смысл: они открывают файл и ищут заголовок
дословно.

## Предусловие: порядок относительно двух соседних фич

**`source-and-correct` — жёсткое предусловие.** До неё `apps/recognizer` использует
`NullMatchIngredientPort` (DEC-A-014) и `recognition.status = done` НЕДОСТИЖИМ — начинать Phase 3
раньше значило бы тестировать карточку на данных, которых физически не бывает.

**`consent-and-telegram-auth` — предусловие для КОНКРЕТНОЙ ветки (E14/AC-2), не для всей фичи.**
Всё, что происходит ПОСЛЕ `consent_at IS NOT NULL`, тестируется независимо (тестовая фикстура может
записать `account.consent_at` напрямую в БД, минуя реальный маршрут `POST /api/v1/consent` — это
законно для теста, как и `account.tier = 'paid'` в AC-5). Реальный интеграционный прогон E14
(«согласия нет → отказ → grant через реальный `POST /api/v1/consent` → повтор создания успешен»)
ждёт, пока у `consent-and-telegram-auth` появится код, и ОТДЕЛЬНО назван в чеклисте ниже как
опциональный до её готовности.

## Порядок выполнения Phase 3

1. **Миграция** (`packages/db/migrations/<следующий свободный>_share_card_recognition_unique.sql`):
   `UNIQUE (recognition_id)` на `share_card`. Прогнать раннер на пустой базе и на базе с уже
   существующими (нетронутыми на миграции) строками `share_card`, если такие появятся к этому моменту
   из тестовых фикстур соседних фич.
2. **`sanitizeForCardText`** (`packages/shared/src/text/`) — первым, от неё зависят и рендер, и
   SSR-страница; юнит-тест на bidi-символы и обрезку длины сразу.
3. **`ShareCardRenderInput` и страж** (`packages/shared/src/domain/share-card.ts`,
   `tests/guard/share-card-field-set.test.ts`) — тип и страж пишутся ДО `buildCardPayload`, чтобы
   реализация проектировалась под уже застрахованный контракт, а не наоборот.
4. **`buildCardPayload`** (`apps/api/src/share/build-card-payload.ts`) — деструктуризация, бейдж
   fail-closed, чтение Snapshot (НЕ `model_estimate_kcal`).
5. **`renderCardImage`** (`apps/api/src/share/render-card-image.ts`) — SVG-шаблон, композиция
   `sharp`, геометрия бейджа и плиток без пересечения.
6. **`createShareCard`** (`apps/api/src/share/create-share-card.ts`) — транзакция с блокировкой
   строки владельца ПЕРВЫМ оператором, `ON CONFLICT DO NOTHING`, вызов чтения согласия (см.
   `03_architecture.md`, «Зависимости от соседних фич» — интерфейс к `consent-and-telegram-auth`).
7. **Маршрут 5** (`apps/api/src/routes/share-cards.ts`) и `recordShareClick`.
8. **Маршрут 6** (`apps/web/src/app/c/[cardId]/page.tsx`) и `recordCardView`.
9. **Точка интеграции со `scan-pipeline`**: одна строка фонового вызова на экране результата —
   координируется с владельцем файла экрана результата (`swarm-file-evidence.md`, «одна правка —
   один явный владелец файла»); если экран результата ещё не существует к моменту Phase 3 этой фичи
   (сборка идёт параллельно), правка становится TODO с именованным местом вставки, а не блокирует
   остальную фичу — карточка по-прежнему создаётся ПО ТРЕБОВАНИЮ (маршрут 5 работает и без
   пре-варминга, просто без «уже готова заранее»).
10. **Стражи** и их ИСПЫТАНИЕ МУТАЦИЕЙ — семь пар из `04_refinement.md`, обе строки каждой пары в
    квитанции.
11. **Конкурентные тесты** (AC-12, AC-17) — последними, на настоящем PostgreSQL профиля `test`.

## Команды

```bash
# из каталога проекта, после source-and-correct
npm run migrate                       # применить миграцию этой фичи
npm test                              # unit + integration + guard + конкурентные
npm run lint && npm run build
docker compose build api web
node ../../.claude/hooks/check-model-cost.cjs .   # NFR-3: потолки не тронуты
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . --completion
```

`docker compose up` — только после `node ../../.claude/hooks/check-ports.cjs .` и
`bash ../../scripts/check-port-conflicts.sh .`.

## Чеклист готовности

- [ ] Миграция применяется и повторяется вхолостую; `UNIQUE (recognition_id)` отбивает вторую вставку
      НА УРОВНЕ БАЗЫ (тест пробует прямой SQL-`INSERT`, не только через API).
- [ ] Карточка содержит ровно объявленные поля; страж по типу и по рантайму оба испытаны мутацией.
- [ ] Бейдж fail-closed доказан на пяти «плохих» значениях тарифа И на одном «хорошем» (`paid`) —
      обе строки, иначе страж мог бы всегда отвечать `true`.
- [ ] Идемпотентность создания доказана и последовательно (AC-6), и конкурентно 20 параллельными
      вызовами (AC-17) — обе строки в квитанции, последовательная не заменяет конкурентную.
- [ ] Гонка «отзыв согласия ↔ создание карточки» (AC-12) прогнана в ОБЕИХ раскладках интерливинга;
      для каждой в квитанции — момент проверки `revoked_at` относительно коммитов обеих транзакций.
- [ ] `GET /c/{card_id}` даёt один `404` на три разных «плохих» адреса; `no-store` присутствует на
      каждом из четырёх прогнанных запросов, включая все три `404`.
- [ ] `card_view` не создаёт зрителю ни cookie, ни строки `device_session`; его IP не встречается ни
      в одной новой строке `growth_event`, ни в журнале сервера сверх того, что уже пишет прокси.
- [ ] `share_click` пишется на КАЖДЫЙ успешный `POST /api/v1/share-cards`, включая повторные —
      отдельно от идемпотентности самой строки `share_card`.
- [ ] Экранирование доказано на ОБЕИХ поверхностях (SSR и SVG) одним и тем же вредоносным входом,
      не двумя разными.
- [ ] Ни один тест этой фичи не увеличил счётчик обращений к `ModelProvider` и не изменил ни один
      `scan_quota_counter`.
- [ ] `npm test`, `npm run lint`, `npm run build` зелёные; `docker compose build api web` проходит.
- [ ] Ворота `--completion` возвращают `0` на ФАКТИЧЕСКИХ заголовках тестов.
- [ ] Стыки 1–3 из `01_specification.md` подтверждены или переопределены координатором до начала
      Phase 3; интеграционная точка со `scan-pipeline` (шаг 9 выше) согласована с её исполнителем.
- [ ] (Опционально, если `consent-and-telegram-auth` к этому моменту реализована) сквозной прогон
      E14 через РЕАЛЬНЫЙ `POST /api/v1/consent`, а не через прямую запись `consent_at` в БД.

## Что эта фича НЕ доказывает

- **Живого распознавания не было и не требуется** — фича работает на уже посчитанном Snapshot,
  DEC-A-009 её не касается напрямую (она не вызывает `ModelProvider` вовсе, NFR-3).
- **Кабинет партнёра не читает написанные события** — `partner-codes-and-cabinet` не реализована;
  корректность ЧТЕНИЯ `growth_event` по `partner_code_id` проверяется той фичей, эта только
  доказывает корректность ЗАПИСИ.
- **Реальный сквозной вход через Telegram и реальный отзыв согласия** — если `consent-and-telegram-auth`
  не готова к моменту реализации, гейт консента тестируется на уровне прямой записи в БД
  (`account.consent_at`), а не через её собственные маршруты; это названо явно в чеклисте, а не
  скрыто за зелёной галочкой.
- **NFR-PERF-001 (≤ 6 с p95) этой фичей не измеряется** — сборка карточки происходит уже ПОСЛЕ
  `done`, вне бюджета времени результата; собственный бюджет рендера карточки (латентность
  `POST /api/v1/share-cards`) в каноне числом не назван и в неделю измерения не входит явно
  — назвать это отдельно координатору при желании измерить.
- **Клиентская кнопка «поделиться» и `navigator.share`** — не реализуются здесь; фича отдаёт файл и
  адрес, UI-триггер остаётся за экраном результата.
- **Уборка карточек-«сирот»** (объект в бакете без строки после проигранной гонки `ON CONFLICT DO
  NOTHING`, шаг 6 `CreateShareCard`) — эксплуатационная задача, не реализуется этой фичей; редкость
  события (только при настоящей гонке двух одновременных запросов на один и тот же скан) делает её
  некритичной для MVP, но она НАЗВАНА, а не забыта.

## Criterion coverage

**Таблица ПЛАНОВАЯ.** Phase 3 заменяет пути и заголовки фактическими.

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-share-card-and-growth-events-1 | tests/integration/share-cards-route.test.ts | завершённый скан даёт карточку с ровно четырьмя числами и без данных здоровья |
| AC-share-card-and-growth-events-2 | tests/integration/share-cards-consent-gate.test.ts | отсутствие согласия отклоняет создание и не оставляет карточку после отказа |
| AC-share-card-and-growth-events-3 | tests/integration/share-cards-route.test.ts | незавершённый и отказанный скан дают четыреста девять без создания карточки |
| AC-share-card-and-growth-events-4 | tests/unit/build-card-payload.test.ts | пять неопознанных значений тарифа дают бейдж независимо от поля тела запроса |
| AC-share-card-and-growth-events-5 | tests/unit/build-card-payload.test.ts | ровно paid снимает бейдж и доказывает что страж умеет не срабатывать |
| AC-share-card-and-growth-events-6 | tests/integration/share-cards-route.test.ts | повторный вызов возвращает ту же карточку а чужой скан даёт четыреста четыре |
| AC-share-card-and-growth-events-7 | tests/integration/public-card-page.test.ts | удалённая отозванная и неизвестная карточка дают один и тот же ответ без содержимого |
| AC-share-card-and-growth-events-8 | tests/integration/public-card-page.test.ts | заголовок no-store присутствует на успехе и на отказе |
| AC-share-card-and-growth-events-9 | tests/integration/public-card-page.test.ts | отзыв согласия между двумя запросами меняет ответ со второго обращения |
| AC-share-card-and-growth-events-10 | tests/integration/growth-events.test.ts | просмотр карточки анонимным зрителем не сохраняет его личность |
| AC-share-card-and-growth-events-11 | tests/integration/growth-events.test.ts | клик по поделиться считает попытки а не карточки |
| AC-share-card-and-growth-events-12 | tests/concurrency/share-card-consent-race.test.ts | ни в одной раскладке гонки карточка не остаётся открытой после отзыва |
| AC-share-card-and-growth-events-13 | tests/unit/sanitize-for-card-text.test.ts | инъекция и символ направления письма не проходят ни на одну поверхность |
| AC-share-card-and-growth-events-14 | tests/guard/share-card-field-set.test.ts | множество полей типа равно восьми разрешённым именам |
| AC-share-card-and-growth-events-15 | tests/unit/build-card-payload.test.ts | лишнее поле входа не попадает в результат сборки |
| AC-share-card-and-growth-events-16 | tests/integration/migrations.test.ts | повторный прогон миграции идемпотентен и уникальность recognition id существует в базе |
| AC-share-card-and-growth-events-17 | tests/concurrency/share-card-idempotency.test.ts | двадцать одновременных создателей получают одну карточку и один идентификатор |
| AC-share-card-and-growth-events-18 | tests/integration/share-cards-quota-untouched.test.ts | создание карточки не вызывает поставщика модели и не меняет счётчики потолков |
