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
Scenario: Первый вопрос с внешнего домена создаёт установку (SC-US-015-1)
  Given бот с разрешённым origin "https://shop.example"
  When посетитель с этой страницы задаёт 3 вопроса
  Then widget_install содержит ровно 1 строку (bot, "shop.example")
  And /admin/metrics показывает "внешних доменов с ≥1 вопросом: 1 из 15"

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
