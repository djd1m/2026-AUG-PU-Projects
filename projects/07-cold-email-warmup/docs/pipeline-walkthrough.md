# Как устроен конвейер N7: от ящика до остановленной цепочки

Состояние 2026-10-02: **F01 авторизация реализована и принята; почтовые этапы ещё планируются**. Этот
walkthrough объясняет согласованный процесс по Specification/Pseudocode; F01 уже
подтверждён runtime, а шаги почтового конвейера ниже остаются планом,
а не снят с работающего production-стенда. При реализации каждый этап будет
привязан к исходнику и проверенному build. Три HTML прототипа уже имеют отдельные
браузерные доказательства, но не подменяют сервисы ниже.

Документ построен по форме N5/N6: кто выполняет этап, что получает, какие
ресурсы тратит, что возвращает и как восстанавливается. Устройство — в
[Architecture](Architecture.md), решения — в [ADR](ADR.md), разрешения — в
[decisions-owner](decisions-owner.md).

## Кто выполняет работу

| Участник | Что делает | Что ему недоступно |
|---|---|---|
| Браузер владельца | Формы, preview, отдельные согласия, status | Чужие ящики, backend runtime keys |
| Web/API | Session/tenant проверка, сохранение заданий и согласий | Самовольная отправка на save формы |
| PostgreSQL | Durable очередь, quota, suppression, audit | Расшифровка mailbox credentials без runtime key |
| Worker | Bounded SMTP/IMAP операции и scheduler | Обход live gate, consent, лимитов и complaint quarantine |
| Почтовый provider | Принимает SMTP, хранит IMAP | Не гарантирует inbox placement ответом SMTP accepted |

Продукт **не вызывает LLM** в согласованном MVP. Персонализация — подстановка
заданных полей; переписка пула — контролируемые шаблоны, AI replies исключены.
Доступные ключи N5/N6 не переносятся без необходимости.

## Шаг 1. Подключить ящик

Владелец вводит SMTP/IMAP параметры. Web проверяет границы входа и разрешённый
hostname, сохраняет только зашифрованный AEAD secret и masked metadata.
Подключённый ящик ещё не имеет разрешения на письма. Неподдерживаемый provider,
невалидный TLS или опасный IP даёт явную ошибку. В тестовом режиме подключение
обозначено как тестовое, не маскируется под проверку настоящего аккаунта.

## Шаг 2. Войти в общий пул

Отдельное unchecked согласие на pool exchange сохраняется с датой/версией.
Scheduler выбирает пару из разных tenant только среди пригодных участников;
нет пары — waiting, не synthetic progress. Seed стратегия — когорта курса,
цель 30 eligible ящиков через семь дней pilot. Это цель, не измеренный tipping point.
В dashboard участники видят агрегаты, не каталог адресов. При самой SMTP
переписке получатель неизбежно увидит адрес отправителя, routing headers и тестовый
body в своём почтовом клиенте; отдельное согласие прямо раскрывает эту передачу.
Частные кампании, списки контактов и credentials другим участникам недоступны.

## Шаг 3. Составить цепочку

Пользователь задаёт до пяти шагов и до ста контактов с полями. Preview показывает
точный plain-text текст, missing field блокирует запуск. HTML и header injection
не исполняются. Новое содержимое/расширение получателей инвалидирует старое
campaign consent; запуск требует отдельного действия по текущей версии.

## Шаг 4. Зарезервировать право на попытку

Worker берёт due job, одной транзакцией проверяет consent, состояние адресата,
fresh IMAP, suppression и общий warmup+campaign budget. Default 10/day на ящик,
pilot ceiling 30/day — наши проектные потолки, не разрешение провайдера.
Параллельные workers не обходят квоту: unique job key + atomic quota reservation.
Claim сам по себе ещё не разрешает I/O. Непосредственно перед ним отдельная
короткая транзакция получает общую с каждым stop writer блокировку и условно
переводит claimed→submitting, заново проверяя все разрешения и состояние.
Только commit этой операции разрешает bounded I/O, уже без DB lock.

## Шаг 5. Отправить или честно остановиться

По умолчанию вызов идёт в локальный test transport. Live mode требует ещё и
разрешения оператора/провайдера. Перед submission повторно проверяется отмена;
затем атомарно фиксируется final submitting. После этого commit одна in-flight
попытка ещё может отправиться даже если consent отозван до socket call; UI это
показывает. До этого commit остановка гарантирует ноль вызовов. Каждое сообщение получает body unsubscribe
и one-click headers. Подтверждённое SMTP принятие означает submitted, не доставку
во входящие и не рост reputation.

Неоднозначный timeout после submission — unknown_delivery, без слепого resend.
Письмо, уже принятое SMTP, нельзя отозвать; UI объясняет эту границу.

## Шаг 6. Найти ответ и прекратить следующие шаги

IMAP worker читает bounded headers и сопоставляет sender + Message-ID references.
UID-observation и cursor записываются атомарно. Семантическая остановка
unique(mailbox,enrollment,reply) сохраняет идемпотентность даже при новой
UIDVALIDITY; физическое наблюдение может иметь новый UID без второго reply effect.
Следующие queued steps отменяются. Сбой UIDVALIDITY требует безопасного rescan,
poll каждые30s, возраст полного успешного poll>=60s блокирует отправку.
Rescan максимум20×100 headers и120s за попытку; неполный rescan остаётся paused,
возобновление возможно только после полного high-water и tail poll.

## Шаг 7. Отписка и жалоба

GET ссылки показывает подтверждение, POST выполняет opt-out без логина.
Suppression tenant-wide сохраняется идемпотентно и проверяется каждым новым job.
Authenticated complaint добавляет suppression и sender quarantine. Внешний
complaint feed требует конкретного provider adapter, без универсального
неподписанного webhook. Уже отправленное сообщение не исчезает из чужого inbox.

## Шаг 8. Показать результат и атрибуцию

Без подтверждённых сопоставимых наблюдений reputation остаётся unknown.
Ручная запись обязательно обозначает источник, даты, metric/unit и denominator.
Share появляется после проверяемого улучшения и выполняется самим владельцем.
Free report содержит badge; paid entitlement проверяется сервером. Partner cookie
и явный код фиксируются до conversion; self-referral/replay не увеличивают счётчики.
Для n<30 показываются raw counts. Локальный fake adapter с отдельным durable provider state обязан успешно
провести тестовый checkout/каноническую проверку/один grant. 503 — отрицательный
сценарий, не готовая billing фича. Fixture100 minor RUB явно TEST; sandbox
не называется настоящей выручкой.

## Что проверено сейчас

Три самостоятельных CJM: Chromium desktop/mobile, keyboard, consent gates,
limits, reply pause, complaint/suppression, escaping и mutation запуска — pass.
54 сценария спецификации имеют алгоритмы; 12 growth BDD и явные security
Examples сохранены. Первое независимое ревью выявило2high/4medium; все замечания контрактов
закрыты отдельными перепроверками, исходный NEEDS WORK сохранён в истории.
Тексты согласия и границы отмены уже исправлены во всех трёх CJM; свежие
фокусные Chromium1440/390 проверки прошли, runtime JS не менялся. Доказательства:
`telemetry/p-replicator/20261002T173314Z-n7-replicate-a1/evidence/cjm-copy-browser/`.
Независимая design validation закрыла все6 замечаний. Toolkit создан; vendor1.13.2
verify составного monorepo-view после появления реального Compose прошёл без незакрытых hints. F01 принят: Node22/PG16, регистрация/сессии/tenant isolation; typecheck/lint/build,
unit5+integration8, independent review ACCEPT и auth browser60checks на1440/390.
Почтовой worker/полный кабинет и их full application E2E ещё ожидаются. Здесь будут добавлены реальные source/build receipts,
а не переписан planned процесс как будто уже работающий.

F02 принят: encrypted mailbox API, отдельные pool/campaign consents, lock-first
writers; corrected10unit/14PG и fresh Astra R1 ACCEPT. Первое IPv6 замечание
исправлено, неудачные попытки передачи ревью сохранены в телеметрии. Live
соединений/писем нет. F03 выполняется двумя ограниченными частями: планирование
и reservation, затем final submitting/local sink/outcomes. Ни claim, ни test
verification не означают реальное отправленное письмо.

F03a принят: реальные campaign/preview/start/pause, encrypted enrollments,
aggregate seed pool и shared quota claim. Исправлена ротация при равном времени
через монотонный claim_order (migration004). Unit12/realPG20 и независимое
закрытие R1 подтверждены. Финальная транспортная авторизация и local sink пока
не реализованы: следующая часть F03b. Production polling пока отсутствует,
поэтому реальные freshness guards остаются закрыты; тестовые fixtures маркированы.

## F03: пул, цепочки и граница отправки приняты

Source55fffed2: 12/12 AC, unit14/fullPG51/restoredB31, независимый Astra ACCEPT. Sol исправил найденные fresh-review гонки часов после lock и ограничение тестовых маршрутов; отдельные квитанции сохраняют bounded failure и последующую механическую проверку. Durable local_test sink и непрерывная квота готовы; реальная отправка отключена. Далее F04 отвечает за реальный durable ingestion fixture/protocol contract, семантическую дедупликацию, unsubscribe и complaints; F05/F06 ещё обязательны.

## F04: приём ответов и публичные остановки

Canonical FR006/007 разбиты на A durable ingestion/rescan и B unsubscribe/complaints/local poll worker, по6AC. План/алгоритм/архитектура в docs/features/f04-reply-suppression/. XL и полные проверки сохранены; отдельная модель пишет код, fresh Astra проверяет. Реальное IMAP-подключение не активируется; локальные данные помечены fixture, свежесть не выдумывается.

### F04a принят

Aef86f20: отдельные физические и семантические идентичности, атомарный курсор и остановка, bounded rescan/tail. Исправлена найденная P1: хвост теперь имеет собственную неизменную границу. Unit16/PG66/restored15, fresh Astra ACCEPT. Первый reviewer не доставил receipt — неуспешная попытка сохранена; новый reviewer доставил обе записи за190.7с. Далее F04b реализует capability unsubscribe, operator complaints и durable local poll без реальной почты.

## F04 завершён

12/12 AC, finalsource06ed2f9d, unit18/fullPG91/restoredowner11. Publicunsubscribe иoperatorcomplaints атомарны; durablelocalpoll сохраняет курсор, H/tailH и fence владельца/поколения. Fresh Astra закрывает оба подтверждённых дефекта. Реальная почта отключена; следующий F05 — localbilling, evidence и growth, затем F06 настоящий browserкабинет и PR.

## F05: платежи и доказательный рост

План docs/features/f05-evidence-billing-growth/: A локальный independentprovider/intent/entitlement/attribution, B manualobservations/anonymousreport/serverbadge. Серверныеfree/teamлимиты3/3 и10/10, TEST100minorRUB30days; лимит почты30нерастёт. N3/N6узкиеpatternsпроверены; сетьпровайдеранеактивируется. ПубличныйreportполучаеттолькоwhitelistбезPII, latest7days/baseline28days/n30guardобязательны.


F05a author candidate integrated8dd916ba: local TEST billing/limits/attribution; unit20,PG98,canonical-fence mutantRED/restored7,canary/sourceimagePASS. Author process1107.306s, actualSol6.1/high hostproof in F05 sol-a-runtime.json. FreshAstra review pending; B/F06 pending, no live charge.

F05a accepted6/6 after fresh Astra high source review (276.183s), exact73input match and no findings. F05b proceeds within the approved plan; live provider stays disabled.

F05b candidate: unit25/type/lint/build0; full initialPG105pass2fail from one fixture/parent, fixed fixture5f2f4a81, affected9pass/mutantRED/restored/canary/sourceimagePASS. Original author1500s timeout124 and incomplete receipt preserved. Separate Sol delivery178.303s exit0; coordinator moved existing completed status to last line for structural gate, original claim preserved in git. Fresh Astra B acceptance pending, F06 UI pending.

F05b fresh Astra REQUEST_CHANGES (373.944s): F1 primitive enum types and F2 UUID canonical idempotent replay. Exact correction-b-r1.md, prior source/evidence preserved. F06 waits acceptance.

F05b F1/F2 corrected in24b93fe6, author677.513s. FullPG109/unit27/restored11,three exact mutantsRED,canary/sourceimagePASS. Fresh targeted Astra closure next; F06 pending.

F05 accepted12/12 onf0fb8556: fresh Astra293.623s closesF1/F2. Final109PG/unit27/restored11 and80sourceinputs PASS. /next now selects F06cabinet/fullDockerbrowser/docs/PR.

/next→/go F06 launched on52ae6bcf: realCJM A cabinet then fullDockerbrowser/perf/docs/PR. Plan in docs/features/f06-cabinet-e2e-delivery, telemetry 20261003T023900Z-f06. Ownerautonomy persists, no live activation/deployment.

F06a realcabinet candidate4858549a: Solprocess1439.769s, type/lint/build0/unit31/fullPG115/401guardmutantRED-restoredGREEN/canary/imagePASS. Image79c996d66355dbdd6d2d87b4fb5e0723d4d899651b798b1ce6d34a1d98b7ecf9, ownURL127.0.0.1:18709/app. CheckerDockerfileassumption correctedonlyinevidence script, preservedfailure. FreshAstrareviewandBbrowser/perf/docs/PRpending.

F06a: независимое ревью Astra (406.031с) нашло R1 — пассивная авторизация повторно уведомляет другие вкладки и сбрасывает форму. Остальные A2–A5 приняты по исходникам и runtime. Узкая правка и регрессионный тест перед браузерной стадией.

### F06a: исправление R1 и доставка результатов

Пассивная проверка сессии больше не рассылает событие login. Семь тестов исполняют реальный authScript; unit38 и PG115 прошли, возвращённый дефект делает тест красным. Первая попытка завершилась тайм-аутом 600 секунд без обязательной квитанции; история сохранена. Отдельная доставка сохранённых результатов завершилась за133,844 секунды. Свежая независимая проверка R1 и реальный браузер F06b ещё впереди.

### F06a принято, начинается браузерный этап

Независимое Astra-ревью закрыло R1: пассивный вход молчит, явный вход уведомляет один раз. Первая попытка ревью180с завершилась до записи файла; продолжение той же независимой сессии66,267с сохранило заключение без повторного исследования. Расход resumed thread накопительный, повторно не суммируется. A1–A6 принято, B1–B6 пока pending.

### F06b: браузер нашёл ошибку вызова fetch

Реальный Chromium зарегистрировал пользователя, но кабинет не загрузился: SessionClient вызывал сохранённый native fetch как метод объекта, что дало Illegal invocation. Прямой fetch того же API вернул200. Исполнитель остановил матрицу за860,221с, сохранил четыре попытки и failed-квитанцию; продуктовый код не менял. Исправление и повтор полного браузера обязательны до принятия.

### F06b: исправление native fetch принято

Одна строка привязки fetch к globalThis устранила браузерный блокер.39unit/type/lint/build и meaningful RED/GREEN прошли. Свежий Astra принял исходники; оба итоговых файла записаны за238,660с, процесс остановлен лимитом240с (неточная фраза before220s в отзыве отдельно исправлена координаторской записью). Новый image d537403b прошёл source/build match и реальный Chromium native smoke: direct200, SessionClient success, кабинет загрузился. Полная матрица продолжается.
