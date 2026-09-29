# Инсайты разработки — грабли, пригодные другим проектам

Формат и правила — [`.claude/rules/insights-capture.md`](../rules/insights-capture.md). Первые записи сняты с проекта
N6 «Суфлёр» (`projects/06-rag-sales-chatbase`), 26–27.09.2026; подробности — в указанных решениях `A-N6-nnn`
(`projects/06-rag-sales-chatbase/docs/decisions-autonomous.md`) и квитанциях фич (`docs/features/<фича>/05_completion.md`).

---

## 2026-09-27 — Предел частоты на двери считал статику: офис за NAT получал 429

**Tags:** caddy-rate-limit, nat, static-assets, shared-resource

**Problem:**
Дверь Caddy ограничивала 120 чтений в минуту на адрес, включая `/_next/static/*` и бандл виджета. Холодная загрузка
страницы Next — 9 запросов, 8 из них статика: офис за одним NAT упирался в 429 на ~13 открытиях страниц в минуту.

**Solution:**
Неизменяемую статику с хэшем в имени вывести из-под предела чтений; мутации и страницы/API оставить. Страж — тест на
точную форму `not path` и на то, что исключение одно.

```caddyfile
@reads {
	method GET HEAD OPTIONS
	not path /_next/static/* /w/widget.*.js
}
```

**References:** A-N6-039; `projects/06-rag-sales-chatbase/proxy/Caddyfile`, `tests/proxy-rate.test.ts`

---

## 2026-09-27 — Новый поддомен «разрешается через раз»: отрицательный кэш DNS

**Tags:** dns-negative-cache, soa-minimum, playwright, new-subdomain

**Problem:**
Сразу после добавления A-записи ~14 % загрузок в браузере падали `ERR_NAME_NOT_RESOLVED`: резолверы помнили ответ
«имени нет», полученный до создания записи. Прибор вёрстки выдавал плавающие «ошибки браузера».

**Solution:**
Не спрашивать имя до создания записи; после — ждать срок SOA minimum (у зоны — 900 с) или условия «N разрешений подряд»,
а не время. Проверять `getent`/публичные резолверы, прежде чем чинить приложение.

**References:** A-N6-042; `projects/06-rag-sales-chatbase/docs/features/tariffs-and-interest/05_completion.md`

---

## 2026-09-27 — `sed -i` на Caddyfile, смонтированном в контейнер: правка не доходит

**Tags:** docker-bind-mount, inode, caddy-reload

**Problem:**
Файл, смонтированный в контейнер bind-mount'ом, привязан к inode. `sed -i` и `mv` создают новый inode — контейнер
продолжает видеть старое содержимое.

**Solution:**
Править на месте, сохраняя inode: `sed '…' F > /tmp/new && cat /tmp/new > F`; после — `caddy validate` и `caddy reload`,
либо пересоздать контейнер (`up -d --force-recreate --no-deps proxy`).

**References:** `projects/06-rag-sales-chatbase/.claude/rules/coding-style.md` (Known Gotchas); `/home/dz-projects-2026/edge/Caddyfile`

---

## 2026-09-26 — Браузер не шлёт `Origin` на GET к своему же origin

**Tags:** cors, origin-header, sec-fetch-site, same-origin

**Problem:**
Проверка origin для конфигурации виджета отвечала 403 на демо-странице самого сервиса: на same-origin GET браузер
заголовок `Origin` не ставит. Серверные тесты подставляли заголовок вручную и дефекта не видели.

**Solution:**
Принимать `Sec-Fetch-Site: same-origin` как «свой origin»; проверять такие пути в настоящем браузере, а не только
обработчиком с вручную выставленным `Origin`.

**References:** A-N6-038; `projects/06-rag-sales-chatbase/docs/features/public-page-and-summary/05_completion.md`

---

## 2026-09-27 — Снимок экрана Playwright сам нарушает CSP страницы

**Tags:** playwright-screenshot, csp, style-src, false-positive

**Problem:**
На странице хозяина с `style-src 'self'` в WebKit фиксировалось нарушение `style-src-elem inline` — казалось, виджет
вставляет инлайновый стиль. Нарушение давал `page.screenshot()`: он встраивает стиль скрытия курсора.

**Solution:**
События `securitypolicyviolation` собирать ДО снимков или в отдельном прогоне без снимков; сравнить «до снимка / после
снимка», прежде чем объявлять дефект.

**References:** A-N6-063; `projects/06-rag-sales-chatbase/docs/embed-contract.md`

---

## 2026-09-26 — Исчерпание бюджета задачи роняло всю задачу вместо усечения

**Tags:** embedding-budget, truncation, long-running-job, ux

**Problem:**
Предпросмотр прочитал 10 страниц, следующая пачка не влезла в бюджет задачи — отказ `quota_refused` сделал всю задачу
failed; прочитанное пропало для человека, экран обещал «до 20 страниц».

**Solution:**
Собственный бюджет задачи/серии — это объявленный размер работы: исчерпание → `done` с `truncated_by` и честной
пометкой «Прочитано N страниц»; внешние потолки (аккаунт, глобальный) — по-прежнему отказ; ноль прочитанного — отказ.

**References:** A-N6-052, A-N6-053; `projects/06-rag-sales-chatbase/docs/features/budget-truncation/`

---

## 2026-09-27 — Извлечение текста склеивало соседние элементы: «целиком5 курсов»

**Tags:** html-text-extraction, rag-chunking, citations

**Problem:**
Карточки из соседних `<span>`/`<a>`, разделённых только CSS, давали в тексте «целиком5 курсов health-advisorПодготовка» —
портились цитаты, поиск и числа.

**Solution:**
Граница «закрывающий тег → открывающий тег, несущий текст» даёт пробел; слово, разрезанное строчным тегом
(`<b>при</b>мер`), остаётся целым; `wbr`/`img`/`script` границей не считаются. Тест — СНАЧАЛА красный на старом коде.

**References:** A-N6-060; `projects/06-rag-sales-chatbase/docs/features/extract-text-separators/`

---

## 2026-09-26 — Результат дочернего процесса по `exit` теряет вывод

**Tags:** node-child-process, exit-vs-close, flaky-test

**Problem:**
Конкурентный тест слотов падал 3 раза из 5: результат процесса брался по событию `exit`, которое приходит раньше, чем
дочитан stdout. Процессы «без вывода» молча выпадали из подсчёта.

**Solution:**
Ждать `close`, а не `exit`; процесс без распознанного вывода — явная ошибка с кодом выхода и stderr.

**References:** A-N6-036; `projects/06-rag-sales-chatbase/tests/probe.concurrency.test.ts`

---

## 2026-09-27 — Мутационный прогон через `git checkout` стёр незакоммиченную правку

**Tags:** mutation-testing, git-checkout, workflow

**Problem:**
Правку не закоммитили, внесли мутацию, прогнали тест и «восстановили» файл `git checkout --` — вместе с мутацией ушла и
сама правка.

**Solution:**
Перед мутациями — коммит правки; восстановление — из коммита. Либо мутировать копию дерева (как `scripts/test-*-mutations.mjs`).

**References:** `projects/06-rag-sales-chatbase/docs/features/account-erasure/08_review.md` (узкое ревью)

---

## 2026-09-26 — ЮKassa не подписывает уведомления: проверка контракта вебхука даёт 2

**Tags:** yookassa, webhook-signature, check-webhook-contract

**Problem:**
`check-webhook-contract.cjs` требует подписи, окна свежести и сравнения постоянного времени; ЮKassa уведомления не
подписывает — код 0 получился бы только ложными строками о подписи.

**Solution:**
Подлинность = IP-источник из списка в коде (по адресу, записанному дверью) + ПЕРЕЗАПРОС платежа у ЮKassa + сверка
суммы/статуса/магазина; в контракте честный код 2 с причиной (как N3). Один магазин = один адрес уведомлений →
у каждого проекта свой магазин.

**References:** A-N6-040, A-N6-041; `projects/06-rag-sales-chatbase/docs/webhook-contract.md`

---

## 2026-09-26 — `FOR UPDATE` строки аккаунта против внешнего ключа — взаимная блокировка

**Tags:** postgres-locking, for-no-key-update, deadlock, foreign-key

**Problem:**
Вставка строки с внешним ключом на `account` берёт `FOR KEY SHARE`, а `SELECT … FOR UPDATE` того же аккаунта в соседней
транзакции с ним конфликтует — встречные оплаты и приёмы приглашений давали deadlock.

**Solution:**
Где меняются только неключевые колонки — `FOR NO KEY UPDATE`; мутация, возвращающая `FOR UPDATE`, обязана давать
настоящий `40P01` в тесте с барьером.

**References:** A-N6-048; `projects/06-rag-sales-chatbase/packages/db/src/{bots,tariffs,payments}.ts`

---

## 2026-09-26 — Неинтерактивный `codex exec`: stdin, длина промпта, заглушка

**Tags:** codex-cli, non-interactive, review-automation

**Problem:**
`codex exec` без закрытого stdin висит до таймаута; длинная постановка в промпте стопорится; обёртка-агент возвращает
заглушку, которая выглядит как «замечаний нет».

**Solution:**
`</dev/null` всегда, постановка — в файле, промпт одной строкой «прочитай <файл>»; ответ в файл `-o`, пустой ответ — не
«чисто»; модель и усилие подтверждать строками `model:`/`reasoning effort:` журнала.

```bash
codex exec --skip-git-repo-check -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only \
  -C "$DIR" -o review.md "Прочитай $BRIEF и выполни ревью" </dev/null > review.log 2>&1
```

**References:** `.claude/rules/codex-invocation-local.md`

---

## 2026-09-27 — Петля ревью: шкала «любая high — D» не сходится на широкой фиче

**Tags:** code-review, convergence, review-scope

**Problem:**
Удаление аккаунта прошло восемь полных ревью Codex — все D: каждое исправление закрывало свои находки, следующее ревью
всей фичи находило новые узкие края. Оценка прогресса не показывала, точки остановки не было.

**Solution:**
Критерий выхода задавать ДО первого круга (N полных кругов, затем узкое ревью диффа с вопросом «закрыто ли и не сломано
ли соседнее»); денежное правило, которое ломается на новых сочетаниях, выносить владельцу на упрощение раньше.

**References:** A-N6-061, A-N6-064; `projects/06-rag-sales-chatbase/docs/features/account-erasure/08_review.md`

---

## 2026-09-26 — Смену постановки, пересланную агенту сообщением, классификатор блокирует

**Tags:** subagents, instruction-poisoning, scope-change

**Problem:**
Изменение постановки (живая оплата вместо экрана интереса), отправленное работающему агенту через SendMessage,
классификатор среды принял за внедрённую инструкцию и остановил агента.

**Solution:**
Смену постановки не пересылать: остановить агента, закоммитить его работу и запустить нового исполнителя-форка, который
наследует разговор со словами владельца.

**References:** `projects/06-rag-sales-chatbase/docs/features/tariffs-and-interest/01_plan.md`

---
## 2026-09-29 — «Сайт не открывается, а соседний на том же сервере открывается» — виноват не прокси

**Tags:** network-diagnosis, vpn-split-tunnel, isp-block, caddy-edge

**Problem:**
`clipmkr.ru` с компьютера владельца давал `ERR_CONNECTION_CLOSED`, а `sufler.aicoding.space` на том же сервере и прокси
открывался. Первая гипотеза владельца — настройки прокси. С сервера, из внешнего фетчера и с телефона сайт открывался.

**Solution:**
Разделять по одному признаку за шаг: (1) второе имя на тот же контейнер (`clipmaker.aicoding.space`) открылось → прокси
исправен, режется имя; (2) `curl -v` показал источник `10.6.7.1` → VPN-туннель с раздельной маршрутизацией, `.ru` идёт
напрямую; (3) без VPN TCP к 194.85.249.105 не устанавливается вовсе, `tracert` умирает за роутером, контрольный
`tracert 1.1.1.1` проходит, пробный пакет с сервера до клиента доходит → фильтр на адрес хостинга; (4) check-host.net: TCP 443/80/22 к 194.85.249.105
недоступны с двух московских узлов разных операторов (и с телефона по домашнему Wi-Fi), доступны из Петербурга и 38
стран, контроль 1.1.1.1 из Москвы проходит → адрес сервера целиком закрыт в части российских сетей, все шесть стендов
равно недоступны этим пользователям; варианты — другой IP у HOSTKEY, российский фронт-прокси, CDN. На сервере запись `tcpdump 'host <ip>'` с `-l`/текстом (файл `-w`
буферизуется и при малом трафике выглядит пустым). Прокси-конфиг Caddy ни разу не был причиной.

**References:** `/home/dz-projects-2026/edge/Caddyfile` (блоки `clipmkr.ru`, `clipmaker.aicoding.space`); чат владельца 29.09

---
