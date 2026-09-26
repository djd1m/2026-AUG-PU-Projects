# bot-cabinet — квитанция

**Фича:** 10 `bot-cabinet` · **Дата:** 2026-09-26 · **FR:** `FR-BOT-001`, `FR-BOT-002`, `FR-TARIFF-003` (+ `FR-INDEX-003`
«Повторить», `FR-SOURCE-001` сайт из кабинета) · **SC:** `SC-US-005-1`, `SC-US-005-2`, `SC-US-005-3`, `SC-US-012-3` ·
**ADR:** ADR-005 (директивы CSP хозяину), ADR-012 (вход и сессии — reuse) · **Тир:** L по признакам (новые маршруты,
платный вызов владельца), автономный режим по постановке координатора, без остановки на плане · **Исполнитель:** Opus 5.5,
один исполнитель · **Ревью:** не проводилось · Код — [`07_code_report.md`](07_code_report.md), решения — A-N6-033.

## Строки reuse

| ADR | Блок | Ответ |
|---|---|---|
| ADR-012 | вход и сессии (кабинет) | **перенесено в foundation — сослались**: `auth-handler.ts` (`readSessionCookie`, cookie `__Host-n6_session`), `AuthService`/`PgAuthStore`; кабинет берёт `account_id` только из сессии (`cabinet-session.ts`, `guardMutation`) |
| — (постановка) | лента стадий N5 `projects/05-podcast-clips-opus/apps/web/src/lib/progress-ribbon.ts` | **адаптировано**: стадии источника N6 (Очередь → Чтение → Фрагменты) вместо стадий видео; `silent` и закрытый набор видов перенесены без изменения смысла; стадия отказа — по причине канона §4 (у `index_job` стадия не хранится); «Чтение» остаётся «идёт», пока страниц меньше итога, даже когда фрагменты уже пишутся |
| — (постановка) | загрузка PDF, задача индексации, ядро ответа, оформление | **сослались, не дублировали**: `source-upload-handler.ts` (PDF-ветка маршрута без изменений), `createSourceJobTx`/`indexJobView`, `answerQuestion`/`loadAnswerBot`/`chargeAnswerQuota`/`searchChunks`, CheckAddress, токены и классы `chat-*`, `source-quote`, `notice` |

## carry_over — выполнено

| Пункт | Как | Доказательство |
|---|---|---|
| Ревью preview-flow, MEDIUM: гонка claim — конкурентным прогоном | 2 теста `Promise.all` в `preview-flow.integration`: один предпросмотр двумя аккаунтами (3 раунда) → ровно `claimed` + `not_found`, владелец — победивший; ЧЕТЫРЕ предпросмотра одним аккаунтом free (3 раунда) → ровно 1 `claimed`, 3 `plan_limit`, ботов 1, три строки предпросмотра не тронуты | мутация `claim-without-for-update` (снят `FOR UPDATE` аккаунта в `lockAccountBots` И `FOR UPDATE OF p` в claim) → **2 failed** |
| Ревью preview-flow, LOW: «`/ask` сразу после claim → 404» | тест: регистрация сохранила бота → тот же держатель возвращает токен → `ask` → `404 preview_saved`; эмбеддингов, вызовов модели и списания `:answers` нет; ядро (`deps.answer` в режиме preview) на активном боте — `not_found` без вызовов (второй барьер) | `preview-flow.integration` 17/17 |
| Уточнить A-N6-032 (3) про Idempotency-Key | дописано «Уточнение 26.09» в `decisions-autonomous.md`: ключ узнаёт повтор только от УЖЕ опознанного браузера; потерю первого ответа держат `ip_previews`/`global_previews`; принято как есть | текст |

**Что показала мутация claim, названо честно.** Гонку «один токен — два аккаунта» ловит не блокировка строки предпросмотра,
а условный `UPDATE preview … WHERE claimed_at IS NULL` (вторая транзакция перечитывает строку после первой). Поэтому тест
«один предпросмотр» под мутацией зеленеет; красными становятся «четыре предпросмотра одним аккаунтом» и «6 CreateBot
одновременно» — там защита только в `FOR UPDATE` аккаунта.

## Проверено — и ЧЕМ

| Утверждение | Чем доказано | Слой |
|---|---|---|
| **SC-US-012-3 / FR-TARIFF-003:** free — 1 бот, второй `403 plan_limit` «Предел плана free: не больше 1 бота…»; studio — 10, 11-й «…не больше 10 ботов», в БД 10 | `bot-cabinet.integration` | 1 |
| **Предел плана под одновременной записью:** 6 одновременных CreateBot на free (3 раунда) → ровно 1 × 201 и 5 × 403, ботов 1 | integration, `Promise.all`; мутация `claim-without-for-update` → красный | 1 |
| **Владение (канон «Чужой ресурс — 404»):** аккаунт studio на чужом боте → `404 not_found` на PATCH, origins, sources (сайт), sources (PDF), reindex, ask, `GET /api/index-jobs/{id}`; несуществующий бот — тот же ответ дословно; настройки, домены, источники, задача, квоты не тронуты; DNS не спрошен, эмбеддингов нет; без сессии маршрут бота — 404, список — 401; `readBotCabinet` чужого — `null` (страницы → `notFound()`) | integration; мутация `owner-check-removed` (OWNED без `account_id`) → **1 failed** (один тест матрицы) | 1 |
| **FR-BOT-001, контакт:** 7 непригодных форм (`''`, текст, `javascript:`, `http://`, «123», `a@b`, перевод строки) → `422 invalid_contact`; почта нормализуется, телефон и `https://t.me/…` принимаются; стереть нельзя; `bot_id` в теле и пустое тело — 400 | integration + unit (18 форм отказа, `readContact` fail-closed) | 1 |
| **SC-US-005-2:** `Shop.Example` → `https://shop.example` (201), дубль → 200 без второй строки, `http://stand.example:8099` принят; путь, частный и публичный IP, localhost, наш origin, `ftp:`, учётные данные, пусто → `422 invalid_origin`; **5 одновременных добавлений при остатке 2 → ровно 2**, всего 20 | integration; unit (17 форм, punycode) | 1 |
| **SC-US-005-3 / SC-US-005-1:** без контакта — `contact_required`, тега нет (5 форм «нет контакта»); с контактом — `<script src="{origin}/w/widget.<hex>.js" data-bot="{public_key}" async>` и три директивы без `unsafe-inline`; без манифеста сборки или с непригодным именем — `bundle_missing`, тега нет | unit + integration на настоящем боте; экраны — браузерный набор; мутация `install-without-contact` → **2 failed** | 1 |
| **Сайт-источник:** `127.0.0.1`, имя с `10.0.0.5`, `169.254.169.254` → 422, ни источника, ни очереди; адрес → 202, очередь `generation 0` после коммита; повтор ключа → та же задача без второй постановки; в кабинете — `queued: true` | integration | 1 |
| **«Повторить» (FR-INDEX-003):** отказавший сайт → 202 с тем же `index_job_id`, фенс 1 → 2, `queued`, причина снята; второй раз — 409; готовый — `409 not_failed`; PDF — `409 reupload` | integration | 1 |
| **Тестовый чат владельца:** ответ с развёрнутой цитатой (заголовок, `https`-ссылка); «не знаю» с контактом без модели; журнал: `embed_question` ×2, `answer_owner` ×1; списано `bot_day_answers` = 2, `visitor_answers`/`ip_answers` не тронуты, `question_log` пуст; при `bot_day_answers` = 50 (free) — `429` «Исчерпан предел «ответов бота в сутки»…» ДО эмбеддинга; `history` в теле — 400 | integration (фейковый шлюз; живых вызовов нет) + unit порядка входа | 1 |
| Порядок входа: лимит → Origin (чужой и пустой → 403 без создания) → тело; `bot_id`/`history` в вопросе → 400 без ядра | unit | 1 |
| Лента стадий: очередь / «k из N» / фрагменты / успех / «нет ответа» / стадия отказа по причине / источник без задачи — `silent` | unit (4 теста) | 1 |
| Экраны: список (с формой и на пределе), бот (6 состояний источников, добавление, чат, ошибка поля), бот пустой, установка (контакт / не собран / код) — R1/R2/R5, axe AA, R8 в обеих темах и двух движках; ширины 320…1440 без горизонтального скролла; тексты трёх состояний ленты; «Повторить» только у отказавшего сайта; без контакта нет ни `pre.snippet`, ни «Скопировать» | `tests/browser/bot-cabinet.test.ts` 72/72 | 1 |
| Регресс | образ **760/760**; мутации quota 6/6, rag-answer 3/3, preview-flow 4/4; браузер 266/266 | 1 |

## Прогон в образе — дословно

`docker compose -f compose.test.yml --project-directory . --env-file /tmp/n6-foundation.env run --rm --build test`
(`tests/artifacts/bot-cabinet/image-run.txt`):

```
 ✓ tests/preview-flow.integration.test.ts (17 tests) 2511ms
 ✓ tests/bot-cabinet.integration.test.ts (9 tests) 1708ms
 ✓ tests/bot-cabinet.unit.test.ts (17 tests) 43ms
 Test Files  36 passed (36)
      Tests  760 passed (760)
   Start at  08:15:11
   Duration  96.39s (transform 1.56s, setup 0ms, collect 5.89s, tests 78.90s, environment 13ms, prepare 3.91s)
exit=0
```

Первый прогон в образе был красным: `1 failed | 759 passed (760)` — страж `theme.test.ts` («цветовых литералов вне двух
блоков нет») поймал `white-space:pre-wrap` в `.snippet` (регэксп `\bwhite\b`). Свойство убрано (код в `pre` прокручивается
в своём контейнере), повтор — 760/760.

Мутации bot-cabinet (`… run --rm --build test sh -c 'node scripts/test-db.mjs && node scripts/test-bot-cabinet-mutations.mjs'`,
`tests/artifacts/bot-cabinet/mutations-run.txt`):

```
owner-check-removed: дефект возвращён → 1 failed | 42 passed (43) (код 1); код восстановлен → 43 passed (43) (код 0)
install-without-contact: дефект возвращён → 2 failed | 41 passed (43) (код 1); код восстановлен → 43 passed (43) (код 0)
claim-without-for-update: дефект возвращён → 2 failed | 41 passed (43) (код 1); код восстановлен → 43 passed (43) (код 0)
exit=0
```

Регресс мутаций (затронуты `ceilings.ts`, `answers.ts`, `answer.ts`, `previews.ts`; `tests/artifacts/bot-cabinet/regression-mutations-run.txt`):
quota 6/6 (`single-statement` 2 failed … `dimension-unchecked` 3 failed), rag-answer 3/3 (`threshold-removed` 3 failed,
`citation-check-removed` 8 failed, `foreign-citation-accepted` 2 failed), preview-flow 4/4 — все восстановления зелёные, `exit=0`.

Браузерный набор (`bash scripts/check-responsive.sh --test`, `tests/artifacts/bot-cabinet/browser-run.txt`):
`Test Files 4 passed (4)`, `Tests 266 passed (266)`, `exit=0`.

typecheck — 0 · lint — «Статические правила: ошибок нет» · build — 0 (стадия `build` образа: «Compiled successfully»,
маршруты кабинета в списке Next) · `check-model-cost.cjs` — 0 («9 вызов(ов) названы…») · `check-job-contract.cjs` — 2
(НЕ ВЫПОЛНЕНА, `not-deployed`, как и до фичи) · `down -v` выполнен.

## Найдено по ходу

1. **Страж темы поймал свойство, а не цвет** (см. выше): `\bwhite\b` срабатывает на `white-space`. Ложное срабатывание
   стража, но дешёвое: обойдено без ослабления стража.
2. **Параметр запроса без использования валит Postgres** («could not determine data type of parameter $2»): мутация
   «снять владельца» оставляет `$2::uuid IS NOT NULL`, иначе красный прогон был бы красным от ошибки SQL, а не от
   пропущенного чужого доступа.
3. **Литералы U+2028/U+202E в регэкспе** (инструмент записи раскрыл escape-последовательности) ломали сборку `@n6/rag`;
   класс символов собирается `new RegExp` из экранированной строки.

## Чего фича НЕ доказывает

1. **Сквозной путь на развёрнутом стенде не пройден** (`docker compose up` не поднимался): кабинет в браузере с настоящей
   сессией, `router.refresh()`-опрос, загрузка PDF из формы, копирование в буфер — не прогонялись. Браузерный набор
   рендерит разметку статически, без гидратации и сети.
2. **Кода установки в продукте сейчас нет**: виджет не собран (фича 11), экран честно говорит «виджет ещё не собран».
   SC-US-005-1 доказан на `installSnippet` с тестовым манифестом и на разметке, не на живом теге.
3. **Удаления источника, домена и бота нет** (A-N6-033 (2)): `DELETE /api/sources/{id}` и переиндексация готового —
   фича `source-lifecycle`; маршрутов удаления домена и бота в каноне нет.
4. **Живая модель и эмбеддинги не вызывались** (запрет постановки); порог 0.40 не откалиброван (A-N6-013).
5. **Тестовый чат без истории** (каждый вопрос отдельно) и расходует бюджет ответов бота — владелец free за 50 тестовых
   вопросов исчерпает суточный лимит посетителей (A-N6-033 (1), отмена — свой scope, правка канона §7).
6. **Предела числа сайт-источников на бота нет** (канон не называет); бюджет страниц плана — на задачу, не на бота.
7. **Независимого ревью не было** (ни Sonnet 5, ни cross-family).

## Привязка к исходнику

Коммита нет (по постановке). Снимок грязного дерева N6 (без `node_modules`, `dist`, `.next`, `tests/artifacts`,
`docs/features/bot-cabinet`): **327 файлов**, `sha256:7309a3263037fa322a815aafa8820a27aeb9f989b845abddb29e145025bb0bfc`
(sha256 отсортированного списка `sha256sum`). Снят после всех прогонов и правок документов (A-N6-033, контракт
стоимости, роадмап, строка статуса `CLAUDE.md`); прогоны — на том же коде (после них менялись только документы).

## Диск

`/` — 94 % (свободно 11 ГБ; до работы — 93 %). Образ `n6-sufler-test:foundation` пересобран на месте (1,74 ГБ, тот же тег),
висящих образов — 0, контейнеров и томов `n6-test` нет. Рост — общий кэш сборки BuildKit (не чистился: общий для проектов).

## Итог

typecheck / lint / build — 0; в образе **760/760**, код 0, пропусков 0; мутации bot-cabinet **3/3** (все три заказанные),
регресс мутаций 13/13; браузерный прибор **266/266**; `down -v`. carry_over preview-flow закрыт (две гонки claim + вопрос
после claim + уточнение A-N6-032 (3)). Роадмап — `done`. Открытое — пункты 1–7 выше, главное: сквозной путь на стенде и
живой код установки вместе с виджетом (фича 11).

Status: completed
