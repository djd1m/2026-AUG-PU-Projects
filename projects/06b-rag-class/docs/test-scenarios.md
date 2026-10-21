# Test Scenarios (BDD) — N6b «RAG-бот для сайта»

**Фаза:** 1 (черновик для Фазы 2: валидатор дополняет и переоценивает) · **Дата:** 2026-09-30
**Правило постановки:** каждое принятое FR-GROWTH — три сценария `@happy-path` (с числом), `@edge-case`, `@security`.
Принятые: 001, 003, 004, 005, 006. FR-GROWTH-002 в сборку не входит (см. Specification) — сценариев не имеет.
Ссылки `SC-US-…` — сценарии приёмки из [`Specification.md`](Specification.md).

## FR-GROWTH-001 — момент ценности: первый верный ответ со ссылкой на свой документ

```gherkin
@happy-path @FR-GROWTH-001
Scenario: CTA появляется ровно в момент первого ответа со ссылкой (SC-US-005-3)
  Given владелец зарегистрировался 7 минут назад и проиндексировал PDF "Прайс.pdf" (12 страниц)
  When он спрашивает в песочнице "сколько стоит доставка?"
  Then ответ содержит ссылку "Прайс.pdf, стр. 3"
  And под ответом показаны 2 CTA: "Вставить на сайт" и "Поделиться демо-страницей"
  And в growth_event ровно 1 запись first_cited_answer для этого аккаунта

@edge-case @FR-GROWTH-001
Scenario: Ответ "не знаю" не является моментом ценности
  Given бот без фрагментов выше порога по теме "парковка"
  When владелец спрашивает "где припарковаться?"
  Then ответ "не знаю" с контактом
  And CTA не показаны и first_cited_answer не записан
  And при следующем ответе со ссылкой CTA показываются впервые

@security @FR-GROWTH-001
Scenario: Событие момента ценности нельзя накрутить повторами и параллельными запросами
  Given бот уже получил first_cited_answer
  When 20 параллельных вопросов в песочнице получают ответы со ссылками
  Then growth_event first_cited_answer для бота остаётся ровно 1
  And событие не создаётся ответами с демо-страницы или виджета чужого аккаунта
```

## FR-GROWTH-003 — бейдж обязателен на Free, снятие — платная опция

```gherkin
@happy-path @FR-GROWTH-003
Scenario: Free-виджет показывает бейдж и клик ведёт на лендинг с ref (SC-US-009-1, SC-US-011-1)
  Given бот аккаунта плана free с public_id "b7Kq2mZx9PaL"
  When виджет загружается на странице разрешённого origin
  Then конфиг содержит badge_required=true и badge_url ".../r/b/b7Kq2mZx9PaL"
  And клик по бейджу даёт 302 на "/?ref=b7Kq2mZx9PaL&utm_source=badge"
  And badge_event содержит 1 показ и 1 клик

@edge-case @FR-GROWTH-003
Scenario: Намерение снять бейдж не снимает бейдж (SC-US-010-1)
  Given аккаунт плана free
  When владелец 3 раза за день нажимает "убрать бейдж"
  Then показано "Скоро: ~990 ₽/мес, оставьте заявку"
  And growth_event badge_removal_intent за сутки ровно 1
  And badge_required остаётся true

@security @FR-GROWTH-003
Scenario Outline: Неопознанный план не снимает бейдж (fail-closed, SC-US-009-2)
  Given в account.plan записано <plan> и badge_removal = "active"
  When запрашивается конфиг виджета
  Then badge_required = true
  Examples:
    | plan       |
    | "PAID"     |
    | " start"   |
    | "Start"    |
    | ""         |
    | null       |
    | "premium"  |
    | "start "   |
    | "STUDIO"   |
    | "studio "  |
    | "start,studio" |
    | "[\"start\"]" |

@security @FR-GROWTH-003
Scenario: Скрытие бейджа на странице хозяина восстанавливается и фиксируется (SC-US-009-3)
  Given Free-виджет на чужой странице
  When скрипт хозяина удаляет элемент бейджа внутри shadow root
  Then в течение 2 секунд бейдж восстановлен
  And badge_event содержит запись tamper
```

## FR-GROWTH-004 — студии: подаккаунты и передача бота клиенту

```gherkin
@happy-path @FR-GROWTH-004
Scenario: Студия передаёт бота клиенту без смены кода вставки (SC-US-014-2)
  Given студия создала подаккаунт клиента и в нём бота с public_id "Qm3pX8"
  And бот отвечает на сайте клиента, 40 фрагментов проиндексировано
  When студия создаёт ссылку передачи, а клиент задаёт e-mail и пароль
  Then клиент входит в свой аккаунт и видит бота
  And public_id остаётся "Qm3pX8", фрагментов по-прежнему 40
  And код вставки на сайте клиента продолжает отвечать

@edge-case @FR-GROWTH-004
Scenario: Предел подаккаунтов при параллельном создании (SC-US-013-2)
  Given у студии 4 подаккаунта
  When 3 запроса "новый клиент" приходят одновременно
  Then создан ровно 1 подаккаунт, два ответа 409
  And всего подаккаунтов 5

@security @FR-GROWTH-004
Scenario: Ссылка передачи одноразовая и не угадывается (SC-US-014-3)
  Given ссылка передачи использована клиентом
  When её открывают повторно или подставляют другой токен той же длины
  Then 410 для использованной и 404 для подделанной
  And владелец подаккаунта и e-mail не меняются

@security @FR-GROWTH-004
Scenario: Подаккаунт не создаёт подаккаунты и не видит соседей (SC-US-013-3)
  Given подаккаунт клиента A студии S
  When он запрашивает создание подаккаунта или бота клиента B той же студии
  Then 403 и 404 соответственно
```

## FR-GROWTH-005 — публичная демо-страница сохранённого бота

```gherkin
@happy-path @FR-GROWTH-005
Scenario: Демо открывается без входа и отвечает со ссылкой (SC-US-012-1)
  Given опубликованный бот с включённым демо и slug "pekarnya-olgi"
  When аноним открывает "/b/pekarnya-olgi" и спрашивает "часы работы?"
  Then ответ со ссылкой на страницу сайта приходит за ≤ 6 секунд
  And заголовок X-Robots-Tag = "noindex" и бейдж Free виден

@edge-case @FR-GROWTH-005
Scenario: Выключенное демо не раскрывает существование бота (SC-US-012-2)
  Given бот существует, демо выключено
  When аноним открывает "/b/pekarnya-olgi"
  Then ответ 404 такой же, как для несуществующего slug

@security @FR-GROWTH-005
Scenario: Посетитель демо ограничен тем же пределом, что посетитель виджета (SC-US-012-3)
  Given посетитель демо задал 30 вопросов за сутки
  When он задаёт 31-й
  Then ответ 429 с контактом владельца, модель не вызывается
  And widget_install не создаётся для нашего origin
```

## FR-GROWTH-006 — метрика недели и инструментирование

```gherkin
@happy-path @FR-GROWTH-006
Scenario: Загрузка виджета и первый вопрос с внешнего хоста дают один внешний виджет (SC-US-015-1)
  Given бот не тестового аккаунта с разрешённым origin "https://shop.example"
  And w.js загружен на "https://shop.example/contacts" (сервер записал запрос конфига)
  When посетитель с этой страницы задаёт 3 вопроса, прошедших валидацию
  Then widget_install содержит ровно 1 строку (bot, "shop.example") с config_seen_at и first_question_at
  And после "перепроверить страницы" /admin/metrics показывает "внешних виджетов с ≥1 вопросом: 1 из 15"

@edge-case @FR-GROWTH-006
Scenario: Конверсия не считается без данных (SC-US-015-3)
  Given кликов бейджа 0
  When оператор открывает /admin/metrics
  Then conv% показано как "нет данных", а не "0%"
  And K показано как "n < 30, не считается"

@security @FR-GROWTH-006
Scenario Outline: Свои и локальные адреса не накручивают метрику (SC-US-015-2)
  Given origin <origin> добавлен владельцем в разрешённые
  When с него задан вопрос
  Then ответ выдаётся, но widget_install не создаётся
  Examples:
    | origin                                   |
    | "https://n6b.194.85.249.105.sslip.io"    |
    | "http://localhost:8099"                  |
    | "http://127.0.0.1:3000"                  |
    | "http://192.168.1.10"                    |
    | "http://printer.local"                   |
    | "https://my-shop.vercel.app"             |
    | "https://bakery.tilda.ws"                |
    | "https://olga.github.io"                 |
```

## «Не знаю» и ответ со ссылкой (постановка: @security-сценарий)

```gherkin
@security @dont-know
Scenario: В базе нет ответа — явное "не знаю" со ссылкой на контакт, без вызова модели (SC-US-006-1)
  Given бот с контактом "hello@bakery.example", ни один фрагмент не выше MIN_SIMILARITY по вопросу
  When посетитель спрашивает "какой у вас ИНН директора?"
  Then ответ "В материалах сайта нет ответа на этот вопрос. Свяжитесь: hello@bakery.example"
  And model_call_log не содержит вызова answer для этого вопроса

@security @dont-know
Scenario: Модель сослалась на фрагмент вне выдачи — "не знаю" (SC-US-005-2)
  Given адаптер fake возвращает cited_ids, отсутствующие в top-5
  When посетитель задаёт вопрос
  Then ответ "не знаю" с контактом, question_log.outcome = "invalid_citation"

@security @dont-know
Scenario: URL из текста модели не выводится, ссылки только из БД
  Given адаптер fake возвращает answer с "https://evil.example/скидка"
  When ответ показывается
  Then в тексте нет "https://evil.example", ссылки источников построены из document
```

## Виджет, origin, пределы, конфигурация, обходчик

```gherkin
@happy-path
Scenario: Индексация сайта с прогрессом (SC-US-002-1, SC-US-004-1)
  Given сайт из 40 HTML-страниц, robots.txt разрешает всё
  When владелец создаёт бота по URL
  Then ответ 202 с job_id за ≤ 1 секунды
  And GET /api/jobs/{job_id} показывает progress_done от 0 до 40 и state "succeeded"

@edge-case
Scenario: Повтор упавшей задачи продолжает, а не начинает заново (SC-US-004-3)
  Given задача упала на 25-й странице из 40 из-за отказа провайдера эмбеддингов
  When владелец жмёт "Повторить"
  Then job_id тот же, 25 страниц повторно не эмбеддятся
  And model_call_log embed_index содержит вызовы только для новых фрагментов

@security
Scenario: Неразрешённый origin не тратит квоту (SC-US-008-3)
  Given бот с allowed_origins ["https://shop.example"]
  When POST /api/widget/ask приходит с Origin "https://evil.example"
  Then 403 без Access-Control-Allow-Origin
  And quota_counter и model_call_log не изменились

@security
Scenario: 50 параллельных вопросов при остатке предела 3 (SC-US-016-1)
  Given посетителю осталось 3 ответа на сегодня
  When он отправляет 50 вопросов одновременно
  Then модель генерации вызвана ровно 3 раза, 47 ответов 429

@security
Scenario: Ненастроенный предел роняет старт (SC-US-016-2)
  Given переменная LIMIT_ANSWER_VISITOR_DAY не задана
  When запускается web
  Then процесс завершается с кодом 1 и сообщением с именем переменной

@security
Scenario: SSRF через URL источника (SC-US-002-3)
  Given URL источника "http://169.254.169.254/latest/meta-data/"
  When владелец создаёт бота
  Then 422 и ни одного исходящего запроса на этот адрес

@security
Scenario: Внедрённый в страницу HTML не исполняется в виджете
  Given фрагмент сайта содержит "<img src=x onerror=alert(1)>"
  When ответ цитирует этот фрагмент
  Then текст выводится как текст, обработчик не выполняется на странице хозяина

@security
Scenario: robots.txt 503 — полный запрет (SC-US-002-2)
  Given сайт отвечает 503 на /robots.txt
  When создаётся бот по этому сайту
  Then задача "failed" с причиной про RFC 9309, ни одна страница не загружена
```

## Дополнения Фазы 1, итерация 1 (правки по валидации)

```gherkin
@security @OWN-06B-002 @M-7
Scenario: Уведомление о внешней модели видно до первого вопроса (SC-US-008-4)
  Given Free-виджет бота на странице разрешённого origin "https://shop.example"
  When посетитель открывает чат и ещё не отправил вопроса
  Then над полем ввода видно "Вопросы обрабатывает внешняя модель через OpenRouter (OpenAI). Не сообщайте персональные данные"
  And текст пришёл в privacy_notice конфига виджета, а пока конфиг не получен, поле ввода неактивно
  And то же уведомление видно на демо-странице "/b/pekarnya-olgi" до первого вопроса

@edge-case @M-6
Scenario: Приём передачи на занятый e-mail не расходует ссылку (SC-US-014-4)
  Given ссылка передачи подаккаунта с ботом "Qm3pX8" и аккаунт "client@shop.example" уже существует
  When клиент принимает передачу с e-mail "client@shop.example"
  Then ответ 409 "этот e-mail уже зарегистрирован"
  And ссылка остаётся действующей, подаккаунт и его бот не изменились

@happy-path @M-5
Scenario: Владелец видит счётчик вопросов и "не знаю" без текстов вопросов (SC-US-017-3)
  Given за 7 дней посетители виджета и демо задали боту 12 вопросов, из них 4 получили "не знаю"
  When владелец открывает бота
  Then видит "вопросов на вашем сайте: 12, из них “не знаю”: 4" и кнопку "Добавить источник"
  And тексты вопросов в кабинете не показываются

@edge-case @L-3
Scenario: "Не знаю" в песочнице бота без контакта не показывает пустой контакт (SC-US-006-3)
  Given неопубликованный бот без контакта, ни один фрагмент не выше порога
  When владелец спрашивает в песочнице "где припарковаться?"
  Then ответ "В материалах нет ответа. Посетители увидят здесь ваш контакт — укажите его перед публикацией"
  And в ответе нет строки "Свяжитесь: " с пустым значением
```

## Дополнения валидатора Фазы 2 (2026-09-30)

Добавлены валидатором по находкам [`validation-report.md`](validation-report.md). Сценарии выше не менялись. Каждый
сценарий V-n закрывает конкретную находку. Теги `@red-now` сняты в итерации 2 (Фаза 1, правки по N-1…N-7): алгоритм в
`Pseudocode.md` делает каждый V-сценарий зелёным по построению.

```gherkin
@security @V-1 @M-3
Scenario: Регистрация создаёт free-аккаунт и сессию; перебор пароля упирается в предел (SC-US-001-1, SC-US-001-2)
  Given аккаунт "olga@bakery.example" существует
  When с одного адреса приходят 11 попыток входа с неверным паролем за 1 час
  Then первые 10 получают 401 с одинаковым текстом для "нет e-mail" и "неверный пароль"
  And 11-я получает 429, bcrypt при этом не вызывается
  And новый e-mail с паролем из 10 символов регистрируется с plan "free" и cookie на 7 дней

@edge-case @V-2 @M-8
Scenario: Провайдер эмбеддингов недоступен при вопросе посетителя
  Given адаптер fake отвечает ошибкой на embeddings(question)
  When посетитель задаёт вопрос в виджете
  Then ответ 503 "сервис ответа временно недоступен", а не 500 и не бесконечная загрузка
  And попытка засчитана в пределы, model_call_log.state = "failed"

@security @V-3 @B-1
Scenario: Песочница упирается в суточный потолок всех аккаунтов (SC-US-016-4)
  Given LIMIT_SANDBOX_GLOBAL_DAY = 2000 и за сутки 20 аккаунтов уже получили по 100 ответов песочницы
  When 21-й новый аккаунт задаёт первый вопрос в песочнице
  Then ответ 429, модель генерации и эмбеддингов не вызывается
  And quota_counter 'answer:sandbox:global' за сутки = 2000

@edge-case @V-4 @H-1
Scenario: Повтор задачи, созданной вчера, продолжает, а не падает по потолку (SC-US-004-3)
  Given задача job_id "J1" создана вчера и упала на 25-й странице из 40 с причиной "исчерпан суточный предел индексации"
  When сегодня владелец жмёт "Повторить"
  Then job_id остаётся "J1", задача переходит в "выполняется"
  And задача не падает с причиной "превышено время задачи" в первую минуту
  And страницы 1–25 повторно не эмбеддятся

@edge-case @V-5 @H-2
Scenario: Обход останавливается на пределе страниц и не зацикливается (SC-US-002-1)
  Given сайт из 150 HTML-страниц, где каждая страница ссылается на все остальные
  When владелец плана Free создаёт бота по URL
  Then загружено ровно 100 разных страниц, ни одна не загружена дважды
  And задача "succeeded" с текстом "обойдено 100 из ≥101"

@security @V-6 @H-3
Scenario: Поддельный Origin без загрузки виджета не засчитывается в метрику недели (SC-US-015-1)
  Given бот с разрешённым origin "https://shop.example"
  And с этого origin ни разу не запрашивался GET /api/widget/config
  When вне браузера приходит POST /api/widget/ask с заголовком "Origin: https://shop.example"
  Then widget_install для ("shop.example") не создаётся
  And после загрузки w.js на странице shop.example и одного вопроса widget_install создаётся ровно 1 раз

@security @V-7 @H-4
Scenario: Фрагменты выше порога, но ответа в них нет — "не знаю" (SC-US-006-2)
  Given калибровочный набор: сайт пекарни и 10 вопросов без ответа в его документах, сходство у каждого ≥ MIN_SIMILARITY
  When 10 вопросов задаются боту на живой модели gpt-4.1-mini
  Then 10 из 10 ответов равны "В материалах сайта нет ответа на этот вопрос. Свяжитесь: <контакт>"
  And результат прогона сохранён артефактом до публикации стенда

@happy-path @V-8 @M-1
Scenario: Вопрос с демо-страницы проходит по своей ручке (SC-US-012-1)
  Given опубликованный бот с демо "pekarnya-olgi" и allowed_origins ["https://pekarnya.example"]
  When аноним на "/b/pekarnya-olgi" спрашивает "часы работы?"
  Then ответ приходит со ссылкой на источник, а не 403 из-за origin нашего хоста
  And widget_install не создаётся

@happy-path @V-9 @M-2
Scenario: Студия собирает бота в только что созданном подаккаунте (SC-US-013-1)
  Given аккаунт kind=studio без подаккаунтов
  When студия создаёт "нового клиента", переключается в него и создаёт бота по URL
  Then ответ 202 с job_id, бот виден студии в списке подаккаунта
  And другая студия получает 404 на этого бота
```

## Дополнения Фазы 1, итерация 2 (правки по N-2, N-3)

```gherkin
@edge-case @N-2
Scenario: Сайт на www. засчитывается одной строкой метрики (SC-US-015-5)
  Given бот с разрешённым origin "https://www.shop.example"
  When виджет загружен на "https://www.shop.example/" и посетитель задаёт вопрос, прошедший валидацию
  Then widget_install содержит одну строку origin_host = "shop.example" с config_seen_at и first_question_at
  And строки с origin_host = "www.shop.example" нет

@security @N-3
Scenario: Демо-страница не встраивается во фрейм чужого сайта (SC-US-012-4)
  Given опубликованный бот с демо "pekarnya-olgi" и allowed_origins ["https://pekarnya.example"]
  When GET "/b/pekarnya-olgi"
  Then в ответе есть "Content-Security-Policy: frame-ancestors 'none'" и "X-Frame-Options: DENY"
  And страница на "http://localhost:8099" с iframe на "/b/pekarnya-olgi" не отображает фрейм, вопрос из него не уходит
```

## Дополнения по итерации 3 (правки N3-2, N3-3)

```gherkin
@security @N3-2
Scenario: Исполнитель модели закреплён, отказ OpenAI не уводит запрос к Azure (SC-US-005-4)
  Given адаптер live настроен на OpenRouter, а шлюз не может обслужить openai/gpt-4.1-mini исполнителем OpenAI
  When посетитель задаёт вопрос в виджете
  Then тела запросов к "/api/v1/embeddings" и "/api/v1/chat/completions" содержат provider {"order": ["openai"], "allow_fallbacks": false}
  And посетитель получает 503 "сервис ответа временно недоступен", попытка засчитана в пределы
  And запроса без поля provider или с другим исполнителем нет

@security @N3-3
Scenario: Чужая страница не списывает квоту демо «простым» запросом (SC-US-012-5)
  Given опубликованный бот с демо "pekarnya-olgi" и счётчик 'answer:bot' за сутки = 7
  When страница "http://localhost:8099" шлёт POST "/api/demo/pekarnya-olgi/ask" с Content-Type "text/plain"
  And вне браузера приходит тот же запрос с Content-Type "application/json" и "Origin: http://localhost:8099"
  Then оба ответа 403, модель не вызывается
  And счётчик 'answer:bot' за сутки по-прежнему = 7
```

## Связь сценариев валидатора с требованиями (Фаза 1, итерация 1)

Сценарии V-1…V-9 выше — текст валидатора; менялись только теги (`@red-now` сняты) и заголовок V-3 (SC-US-016-4). Каждый привязан к
требованию и к месту алгоритма, которое его делает зелёным:

| Сценарий | Находка | Требование и сценарий приёмки | Где реализовано |
|---|---|---|---|
| V-1 | M-3, B-1 | FR-n6b-1 (`LIMIT_AUTH_ADDR_HOUR`), SC-US-001-1, SC-US-001-2, SC-US-001-4 | `Pseudocode.md` Register and login, шаг 0 |
| V-2 | M-8 | FR-n6b-5, NFR-n6b-5 | Answer question, шаг 3 (503, попытка засчитана) |
| V-3 | B-1 | FR-n6b-16 (`LIMIT_SANDBOX_GLOBAL_DAY`), SC-US-016-4 | Answer question, шаг 2 (ключ `answer:sandbox:global`) |
| V-4 | H-1 | FR-n6b-4 (`run_started_at`), SC-US-004-3 | Worker lease loop, шаги 1, 6, 9 |
| V-5 | H-2 | FR-n6b-2, SC-US-002-1 | Crawl site, шаги 3a', 3f, 4, 5 |
| V-6 | H-3 | FR-n6b-15 (определение метрики недели), SC-US-015-1, SC-US-015-4 | Widget config, шаг 0; Widget ask gate, шаг 7; Weekly metric, шаги 2, 2' |
| V-7 | H-4 | FR-n6b-6 (граница гарантии), SC-US-006-2, SC-US-006-4 (ворота выпуска) | ADR-003; `Refinement.md` «Калибровка порога»; `Completion.md` Pre-Deployment |
| V-8 | M-1 | FR-n6b-12 (`POST /api/demo/{slug}/ask`), SC-US-012-1 | Demo page, шаг 3; API Contracts |
| V-9 | M-2 | FR-n6b-13 (`studio_access=true` у подаккаунта), SC-US-013-1 | Studio sub-account, шаг 3 |
