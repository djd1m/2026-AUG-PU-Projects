# Как работает N7: от согласия до остановленной цепочки

На 2026-10-03 локальный MVP реализован и принят по продуктовым проверкам F01–F06.
Кабинет работает с настоящими API/PostgreSQL; почта и платежи используют только
локальные TEST-адаптеры. Реальная репутация, доставляемость, pilot retention и выручка
не измерялись. Текущий статус публикации — в [Completion](Completion.md).

## Путь пользователя и данных

| Этап | Исполнитель и вход | Результат и восстановление |
|---|---|---|
| 1. Регистрация | Web, email/password | Argon2id, tenant, opaque HMAC session; logout durable, TTL 7 дней |
| 2. Ящик | Web, allowlisted hosts и настройки | AEAD ciphertext с tenant/mailbox/version AAD; наружу masked metadata |
| 3. Согласие | Пользователь, отдельный unchecked opt-in | Версия и disclosure; сохранить настройки недостаточно для отправки |
| 4. Пул | Worker, eligible участники разных tenants | Без пары waiting; одна пара/день, контролируемый тестовый обмен |
| 5. Цепочка | Пользователь, ≤5 шагов/≤100 контактов | Preview plain text, только разрешённые поля, новая версия требует reconsent |
| 6. Claim | PostgreSQL, due job | Atomic quota + lease; warmup/campaign делят общий дневной budget |
| 7. Submitting | Worker, повторная проверка под lock | Commit разрешает одну bounded попытку; I/O выполняется без DB lock |
| 8. Результат | Durable local sink | Accepted / proven pre-DATA failure / unknown; unknown не посылается повторно |
| 9. Poll | Local inbox fixture → reply worker | UID horizon/cursor и semantic dedup; crash replay не дублирует эффект |
| 10. Stop | Reply/unsubscribe/complaint/owner | Общий lock сериализует stop с submitting; будущие задания отменяются |
| 11. Наблюдения | Пользователь, ручной источник и числа | Сравнение совместимых окон, unknown без данных, публичный whitelist snapshot |
| 12. TEST billing/growth | Cabinet + отдельный оператор | Immutable intent, canonical TEST state, один grant/attribution count |

Credentials расшифровываются только сервером с внешним runtime keyring. Прямые
участники обмена неизбежно видят sender, заголовки и тестовое содержимое — это
прямо раскрыто в pool consent. API не предоставляет им чужие контакты, частные
кампании, credentials или каталог участников.

## Квота и точная граница остановки

Default — 10 попыток/день/ящик, максимум 30 и не выше allowlist ceiling. Это наши
ограничения, а не разрешение почтового провайдера. Claim имеет lease 45 секунд;
полный poll должен быть моложе 60 секунд. Время проверяется после получения lock.
Все stop writers и final claimed→submitting сначала берут advisory lock `(7,1)`.

Если stop закоммичен до submitting, транспорт не вызывается. Если submitting
уже закоммичен, одна in-flight попытка может закончиться. Квота unknown остаётся
занятой; blind retry запрещён. Доказанный pre-DATA failure допускает максимум три
попытки за 120 секунд с задержками 5/30 секунд. Crash recovery не превращает
неизвестный результат в разрешение отправить ещё раз.

## Ответы, отписки и жалобы

Poll фиксирует UIDNEXT−1 и bounded страницы, максимум 100 headers/page,
20 страниц/120 секунд, 30 секунд на страницу. UIDVALIDITY и физический UID не
заменяют semantic identity: повторное сканирование не повторяет enrollment effect.
Owner/generation fence отбрасывает поздний callback старого polling-процесса.

GET unsubscribe показывает подтверждение без записи; POST идемпотентен.
Каждое локально сформированное письмо содержит body-link, List-Unsubscribe и
List-Unsubscribe-Post. Браузерный confirm сохраняет same-origin policy, внешнему
origin доступ запрещён; server-to-server one-click без Origin поддерживается.
Жалоба использует отдельный operator Bearer, rate limit и quarantine.

## Наблюдения и деньги

Источник вводится вручную; сервер не ходит по пользовательскому URL и не выдаёт
ручное наблюдение за автоматическое измерение. Сравниваются источник/ref/метрика/
направление и равные непересекающиеся окна. Latest ≤7 дней, baseline ≤28 дней.
Без улучшения или сопоставимости share заблокирован. При n<30 видны raw counts;
публичный отчёт сохраняет историю и только origin источника, токен можно отозвать.

TEST Team — fixture 100 minor RUB/30 дней; Free 3/3, Team 10/10 ящиков/активных
кампаний. Пользователь создаёт intent, отдельный оператор меняет canonical local
provider state и запускает reconcile. Повторы не выдают второй grant. Explicit
partner code приоритетнее подписанного cookie; self-referral/replay не увеличивают
счётчик. TEST conversion count не равен реальной выручке или доказанной причинности.

## Ресурсы и границы

Node 22/TypeScript, native HTTP, pg, Argon2id, PostgreSQL 16. Отдельные Node workers
используют тот же доменный код и БД. Нет Redis, LLM, внешних UI assets или реальных
SMTP/IMAP/payment SDK. Максимум два KDF, без очереди; контейнерные проверки CPU2.
Стек изолирован, PostgreSQL без host port. Ключи не копировались из N5/N6, поскольку
продукту LLM не нужен. [Reuse inventory](reuse-inventory.md) фиксирует разрешённые
внутренние заимствования, source SHA и лицензионные ограничения.

## Как получен принятый результат

| Пакет | Результат | Принятый исходник |
|---|---|---|
| Discovery/SPARC | 3 автономных HTML CJM, выбран A; consent/lock/dedup уточнены до кода | [план и разрешение](decisions-owner.md) |
| F01 | Auth/tenant isolation/Argon2 bounds | 3b8763a1 |
| F02 | AEAD settings, SSRF allowlist, separate consents | b8abcd53 |
| F03 | Pool, campaigns, atomic quota/submitting | 55fffed2 |
| F04 | Reply dedup, poll fences, suppression | 06ed2f9d |
| F05 | Manual evidence, TEST billing, reports/attribution | f0fb8556 |
| F06 | Persistent cabinet + actual browser matrix | 21e42881, final metadata 9413b431 |

Каждый пакет проходил ROUTE → план/валидацию → bounded Sol implementation → fresh
Astra review → только конкретные исправления. Реальные browser runs нашли passive
broadcast loop, native fetch receiver, unsubscribe form Origin и mobile overflow.
Они исправлены и закрыты отдельными независимыми отзывами; неудачные попытки сохранены.

Финальный browser пакет проверил весь путь на Chromium 1440/390 и критические
ветки Firefox/WebKit 390, logout/expired session/другую вкладку, tenant IDs,
клавиатуру, reduced motion и states. Финальный narrow layout run: 218 проверок,
восемь revoked reports, root width390. Ранний full PG набор:115, финальный unit:39.
Measured API p95 при concurrency10:109.1мс desktop и85.2мс mobile (100 запросов
на серию, CPU2), без hashing/provider I/O; это локальная характеристика, не SLA.
Историческая фраза «not currently achieved» в frozen Specification описывала
состояние до реализации; измерения теперь приведены в [AC trace](acceptance-traceability.md).

Профиль compact-quality-first-v2, XL по риску. Код/тесты — подтверждённый
`gpt-6.1-sol/high`, независимые review — `gpt-6-astra/high`. Модель/usage нативного
координатора неизвестны (`null`); cost в runtime-метаданных тоже `null`. Raw usage
хранится по попыткам, resumed cumulative usage нельзя суммировать дважды. Высокий
reasoning выбран по сложности, оптимальность этой настройки не измерялась.

Discovery начат 2026-10-02 около17:33 UTC; F06 начат 2026-10-03 02:41:50.928106 UTC.
Время включает чтение, очереди общего Docker, ревью и исправления. В частности,
финальный layout author занял840.051с, fresh reviewer240.001с: процесс review
получил timeout124 после записи завершённого ACCEPT/receipt, а gate подтвердил
доставку. Это раскрыто отдельно, не переименовано в чистый process exit0.
Точная конечная длительность и пробелы — в [телеметрии](telemetry/features/20261003T023900Z-f06/run.json).

## Дальнейшая активация

Seed strategy — добровольная когорта курса, цель30 eligible ящиков через7 дней
после разрешённого pilot; это ещё не измеренный результат. Для живого провайдера,
списаний и внешнего deployment нужен [отдельный checkpoint](deployment-checkpoint.md).
У текущего MVP есть локальная проверенная функциональность, но нет live-пилота.

## Расширенный pipeline от 2026-10-06

[Новый XL-план](plans/expanded-mvp-plan.md) и [дельта требований](features/expanded-mvp/01_specification.md)
включают unlimited connected, живой автопрогрев и AI replies. F07 снимает
тарифный лимит подключений, сохраняя finite active admission; F08–F10 добавляют
проверку провайдеров, SMTP/IMAP и постоянные fair workers; F11–F13 связывают
bounded inbox context → OpenAI draft → HITL/отдельный autopilot consent →
существующую необратимую submitting границу; F14 измеряет всю цепочку, F15 —
живой разрешённый пилот. Оплата остаётся TEST.

Согласованные в OWN-N7-005 параметры пилота: 100 connected/30 active, 3 tenants, 300 eligible arrivals
за 7 суток. Цель p95 arrival→SMTP accepted <300s, минимум95% eligible on-time;
ошибки, просрочки и unknown включены. Draft/API latency не заменяет эту метрику.
Параметры согласованы; достигнутая ёмкость и live-пилот ещё не подтверждены.

2026-10-06 legacy F01–F06 согласованы с текущим role map с сохранением исходных
требований и исторических отчётов. Полные PLAN/VALIDATE проверки восьми feature
контуров проходят; независимое ревью приняло подготовку. F07 принят независимым ревью: unit40, realPG126, focused11 и browser10 проверок прошли;93 runtime-файла совпадают с исходниками. Full completion остаётся FAIL10: восемь будущих expanded-привязок и две F06-привязки. Следующий этап — F08 SMTP/IMAP диагностика; live-действия требуют отдельного разрешения.
Local fixture acceptance и live acceptance учитываются отдельно.


## Панель знаний N7

Root проверил 2026-10-06 10:28–10:30 UTC: dz CLI0.8.44 и harness-core0.8.52
актуальны по npm, переустановка не требовалась. Отдельная tmux-сессия
`dz-knowledge`, окно `n7`, показывает read-only `dz statusline --watch --interval 10`
для этого проекта. Подключение: `tmux attach -t dz-knowledge`. На момент проверки
3 active patterns и 0 quarantined; неизвестные host recall/phase не считаются нулём.
Панель не меняет hooks/config/models и не доказывает исполнение продуктовой задачи.
