# preview-flow — квитанция

**Фича:** 9 `preview-flow` · **Дата:** 2026-09-26 · **FR:** `FR-PREVIEW-001`, `FR-PREVIEW-002`, `FR-LIMIT-002`, `FR-GROWTH-001` ·
**SC:** `SC-US-001-1`, `SC-US-002-3`, `SC-US-003-1`, `SC-US-003-2`, `SC-US-003-3` (+ `SC-US-002-1/2` на маршруте предпросмотра) ·
**ADR:** ADR-007 (макет, не скриншот), ADR-008 (квота), ADR-010 (CheckAddress), ADR-016 · **Тир:** XL по признакам (новый
публичный путь + платный вызов постороннего), автономный режим по постановке координатора, без остановки на плане ·
**Исполнитель:** Opus 5.5, один исполнитель · **Ревью:** не проводилось · Код — [`07_code_report.md`](07_code_report.md),
решения — A-N6-032.

## Строки reuse

| ADR | Блок | Ответ |
|---|---|---|
| ADR-016 | предпросмотр | **написано заново (почему: нет в донорах** — reuse-inventory). Собрано из уже перенесённых блоков N6: CheckAddress (crawler) — **перенесён** в `packages/rag/src/check-address.ts` без изменений логики; `createSourceJobTx`, `readIndexJob`, сторож черновиков (index-job-core) — **сослались**; `chargeQuota` + `previewCreateCharges`/`previewAnswerCharges` (quota-and-spend) — **сослались**; `answerQuestion`, `loadAnswerBot`, `chargeAnswerQuota`, `searchChunks`, `recordQuestion` (rag-answer, chunk-embed) — **сослались, не дублировали**; токены, `.url-form`, `.notice`, `.source-plate` (design-shell) — **сослались** |

## carry_over — выполнено

| Пункт | Как |
|---|---|
| rag-answer (A-N6-029): ответ предпросмотра — `answerQuestion(mode 'preview')` с ботом-черновиком из `loadAnswerBot` по токену | `preview-deps.ts`: бот — `loadAnswerBot(pool, access.botId)`, где `botId` из строки предпросмотра, найденной по HMAC токена из cookie; ядро отвечает только черновиком (`status === 'draft'`) — после claim вопрос предпросмотра даёт 404 |
| квота — `chargeAnswerQuota(mode 'preview')` (2 scope, `:answers`) | та же функция; сессия — ИЗ СТРОКИ предпросмотра, не из текущего cookie |
| ревью rag-answer, находка 2: история ассистента от клиента не принимается | история хранится в `preview.history` (≤ 2 хода); тело вопроса — ровно `{ question }`; `history` → `400 unexpected_field`; тест: поддельный ход «обещаю скидку 90 %» не доходит до модели, в промпт идёт только наш прошлый ответ; мутация `client-history-accepted` → **2 failed** |
| index-job-core п.5: доступ к `GET /api/index-jobs/{id}` по cookie предпросмотра | `resolvePreviewBot` читает cookie и `readPreviewBotByToken` (не истёкший, не сохранённый) |
| design-shell: форма лендинга ведёт на `/preview` (404) | `/preview?url=` — поле и автозапуск; R9 для `/preview/{id}` добавлен в `FIRST_SCREEN_ACTIONS` |
| crawler п.1/п.2: форма URL предпросмотра не проверялась ничем в `web` | CheckAddress в `web` ДО квоты, записи и постановки; мутация `checkaddress-removed-in-web` → **3 failed** |

## Проверено — и ЧЕМ

| Утверждение | Чем доказано | Слой |
|---|---|---|
| **SSRF — отказ ДО постановки:** `127.0.0.1`, `169.254.169.254`, имя с `10.0.0.5` среди A-записей, `[::1]`, порт 8080 → `422 blocked_address`; несуществующее имя → `422 unreachable`; ни строки `preview`, ни счётчика квоты, ни сообщения в очереди | `preview-flow.integration` (Postgres); unit — порядок вызовов `limit → repeat` без `check/create/enqueue`; мутация `checkaddress-removed-in-web` → 3 failed | 1 |
| **SC-US-001-1:** `202 { index_job_id }` + HttpOnly-cookie на 24 ч; бот `draft` без аккаунта, задача `queued` с бюджетом 20/40 000, `expires_at` = +24 ч; квота — только `:create` (`:answers` = 0); очередь — после коммита, `generation 0`; сырой токен в БД не лежит | integration; тело 202 — ровно один ключ (unit) | 1 |
| Идемпотентность: тот же браузер + ключ → та же задача, квота и очередь не тронуты, токен перевыпущен и работает | integration | 1 |
| **Квота `:create`: 5 ОДНОВРЕМЕННЫХ созданий с одного браузера → ровно 1**, остальные `429 limit_preview` с текстом FR-LIMIT-002 (testing.md прогон 4) | integration, `Promise.all` | 1 |
| **`ip_previews`:** 4 разных браузера за одним /24 → 3 проходят, 4-й `429`; браузер из другого /24 проходит | integration | 1 |
| **SC-US-002-3:** после создания 10 ответов проходят, 11-й — `429` «Бесплатный предпросмотр на сегодня исчерпан — зарегистрируйтесь, чтобы продолжить»; 11-й не дошёл ни до эмбеддинга, ни до модели; в журнале `refused_limit` | integration; мутация `answers-quota-removed` → 1 failed | 1 |
| Три состояния + «нет ответа» по `index_job_id`: running 7/20 · no_response (6 мин без пульса) · failed(`robots_disallowed`) · done с макетом (заголовок, H1 из `context_path`) и подсказками из текста | integration; экраны — браузерный набор | 1 |
| SC-US-002-1/2 на маршруте: ответ с развёрнутой цитатой (заголовок, `https`-ссылка, ≤ 160 символов фрагмента); вопрос вне материалов → «не знаю», модель не вызвана | integration (фейковый шлюз; живых вызовов нет) | 1 |
| **FR-GROWTH-001:** CTA только под ПЕРВЫМ answered (после «не знаю» — под первым answered; второй answered — `first_answer: false`); `share_cta_shown` — одна строка на бота | integration | 1 |
| **bot_id — не из тела:** `bot_id` в теле → `400`, ядро не вызвано; бот — из строки предпросмотра | integration + unit; мутация `bot-id-from-body` → 2 failed | 1 |
| **Изоляция предпросмотров:** мой токен + чужая задача → 404 (чтение и вопрос); без cookie → 404; вопрос ищет только во фрагментах своего черновика | integration | 1 |
| **SC-US-003-1:** регистрация с cookie → бот `active` в новом аккаунте, фрагменты и задача не пересчитаны, история очищена, cookie удалён; сторож 24 ч сохранённый бот не удаляет | integration (настоящий `AuthService` + `PgAuthStore` + `createAuthHandler`) | 1 |
| **SC-US-003-3:** свой повторный claim → 409; чужой аккаунт с тем же токеном → 404; claim без входа → 401 | integration | 1 |
| **SC-US-003-2:** токен старше 24 ч → регистрация 200 с `preview: expired`, бот остаётся черновиком; сторож удаляет его вместе с фрагментами и строкой предпросмотра | integration + `watchdogTick` | 1 |
| Предел плана: у аккаунта free уже есть бот → claim `403 plan_limit`, черновик не переходит | integration | 1 |
| Лимит двери ДО тела и ДО CheckAddress; чужой/пустой `Origin` → 403; лишний ключ тела, пустой адрес, адрес с пробелом, непригодный `Idempotency-Key` → 400 до CheckAddress | unit | 1 |
| Экраны: запуск, «k из ≤ 20» (`role=progressbar`, `aria-valuenow`), «нет ответа», отказ, чат пустой, чат с ответом/цитатой/CTA/«не знаю»/лимитом — R1/R2/R5, axe (контраст AA), R8 в обеих темах и обоих движках; R9 — поле вопроса в первом экране 390×844, 375×667, 360×740; ширины 320…1440 без горизонтального скролла | `tests/browser/preview-flow.test.ts`, 64/64 в контейнере Playwright | 1 |
| Регресс | в образе **731/731**; мутации краулера 9/9 (CheckAddress перенесён); браузер 194/194 | 1 |

## Прогон в образе — дословно

`docker compose -f compose.test.yml --project-directory . --env-file /tmp/n6-foundation.env run --rm --build test`
(`tests/artifacts/preview-flow/image-run.txt`):

```
 ✓ tests/preview-flow.integration.test.ts (14 tests) 1159ms
 ✓ tests/preview-flow.unit.test.ts (11 tests) 35ms
 Test Files  34 passed (34)
      Tests  731 passed (731)
   Start at  07:27:51
   Duration  84.73s (transform 1.22s, setup 0ms, collect 4.63s, tests 69.98s, environment 10ms, prepare 3.46s)
exit=0
```

Мутации preview-flow (`… run --rm --build test sh -c 'node scripts/test-db.mjs && node scripts/test-preview-flow-mutations.mjs'`,
`tests/artifacts/preview-flow/mutations-run.txt`):

```
checkaddress-removed-in-web: дефект возвращён → 3 failed | 22 passed (25) (код 1); код восстановлен → 25 passed (25) (код 0)
bot-id-from-body: дефект возвращён → 2 failed | 23 passed (25) (код 1); код восстановлен → 25 passed (25) (код 0)
client-history-accepted: дефект возвращён → 2 failed | 23 passed (25) (код 1); код восстановлен → 25 passed (25) (код 0)
answers-quota-removed: дефект возвращён → 1 failed | 24 passed (25) (код 1); код восстановлен → 25 passed (25) (код 0)
exit=0
```

Регресс мутаций краулера (`tests/artifacts/preview-flow/regression-crawler-mutations.txt`): 9/9 пойманы, в том числе
`check-before-dns-only` 6 failed → 127 passed и `first-address-only` 1 failed → 127 passed на новом пути; `exit=0`.

Браузерный набор (`bash scripts/check-responsive.sh --test`, `tests/artifacts/preview-flow/browser-run.txt`):
`Test Files 3 passed (3)`, `Tests 194 passed (194)`, `exit=0`.

typecheck — 0 · lint — «Статические правила: ошибок нет» · build — 0 · `check-model-cost.cjs` — 0 ·
`check-job-contract.cjs` — 2 (НЕ ВЫПОЛНЕНА, `not-deployed`, как и до фичи) · `down -v` выполнен: контейнеров и томов
`n6-test` нет, висящих образов — 0.

## Найдено по ходу

1. **Тихий отказ, пойманный тестом, а не ревью.** `recordShareCtaShown` передавал ОДИН параметр как `uuid` и как `text`
   (`$1` и `$1::text`) — Postgres отвергал запрос, а обработчик ловил исключение («ответ уже оплачен — не отнимать») и
   молча отдавал `first_answer: false`: CTA не появлялась НИКОГДА. Первый прогон в образе: 1 failed (SC-US-002-1/FR-GROWTH-001).
   Исправлено двумя параметрами; повтор — 731/731. Класс — silent-fallbacks: запасной путь спрятал настоящую ошибку SQL.
2. **Axe: `role="alert"` на `<li>`** ломал семантику списка (4 красных в браузерном наборе); роль перенесена на вложенный
   `<span>`. Эта однострочная правка разметки сделана ПОСЛЕ прогона в образе (его наборы разметку не рендерят); `build` и
   браузерный набор — после неё.
3. **Смонтировать каталог артефактов мутаций в контейнер не разрешено** — логи отдельных красных/зелёных прогонов
   (`mutations/*.txt`, `results.json`) остались внутри удалённого контейнера; в репозитории — итог stdout дословно.

## Чего фича НЕ доказывает

1. **Сквозной путь на развёрнутом стенде не пройден** (стек `docker compose up` не поднимался): настоящий краулинг сайта,
   воркер, cookie `__Host-` через TLS-прокси, «URL → первый ответ ≤ 5 мин» (метрика p50), SC-US-001-1 «экран за ≤ 2 с»
   — не измерены. Интеграционный тест подменяет индексацию прямой записью страницы и фрагмента.
2. **Живая модель и живые эмбеддинги не вызывались** (запрет постановки); порог 0.40 НЕ откалиброван (A-N6-013);
   остаточный риск «валидная цитата, выдуманный текст» — A-N6-030, ждёт владельца.
3. **Вторая кнопка CTA «Поделиться ссылкой на бота» не выведена, `share_cta_click` не пишется** — нет `/b/{slug}`
   (A-N6-032 (7)). FR-GROWTH-001 закрыт наполовину: показ и событие показа — да, второе действие и клик — нет.
4. **Кабинет не показывает сохранённый бот** — только уведомление «сохранён»; список ботов и код установки — фича
   `bot-cabinet`. «Бот стал active» (SC-US-003-1) доказан на уровне БД, не экрана.
5. **Сброс cookie браузера даёт новую сессию** — ещё 1 предпросмотр; предел держат `ip_previews` (3 на /24) и
   `global_previews` (200). За NAT с 3+ добросовестными владельцами четвёртый получит отказ — принятый размер потолка канона.
6. **Живой прибор адаптивности** (`check-responsive.sh` без `--test` против стенда) не запускался: браузерный набор
   рендерит настоящую разметку компонентов статически, без гидратации и сетевых запросов экрана.
7. **Независимого ревью не было** (ни Sonnet 5, ни cross-family).

## Привязка к исходнику

Коммита нет (по постановке). Снимок грязного дерева N6 (без `node_modules`, `dist`, `.next`, `tests/artifacts`,
`docs/features/preview-flow`): **299 файлов**, `sha256:c73acb92ae87db52c17bdc0cd2108501f731242638f0471735e073c36655faa6`
(sha256 отсортированного списка `sha256sum`). Снят после всех прогонов и правок документов (A-N6-032, роадмап, строка
статуса `CLAUDE.md`).

## Диск

`/` — 93 % (свободно 11 ГБ; до работы — 92 %, 13 ГБ). Образ `n6-sufler-test:foundation` пересобран на месте (1,72 ГБ, тот
же тег), висящих образов — 0, контейнеров и томов `n6-test` нет. Рост — общий кэш сборки BuildKit (не чистился: общий).

## Итог

typecheck / lint / build — 0; в образе **731/731**, код 0, пропусков 0; мутации preview-flow **4/4** (все четыре
заказанные), регресс краулера 9/9; браузерный прибор **194/194**; `down -v`. Роадмап — `done`. Открытое — пункты 1–7
выше, главное: сквозной путь на развёрнутом стенде и вторая кнопка CTA вместе с `/b/{slug}`.

Status: completed
