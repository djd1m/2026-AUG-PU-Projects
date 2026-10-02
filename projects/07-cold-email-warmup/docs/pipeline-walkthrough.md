# Как устроен конвейер N7: от ящика до остановленной цепочки

Состояние 2026-10-02: **план v1 утверждён; backend ещё не реализован**. Этот
walkthrough пока объясняет согласованный процесс по Specification/Pseudocode,
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
Участники видят агрегаты, не список адресов других владельцев.

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
После commit выполняется bounded I/O, без удержания DB transaction на сеть.

## Шаг 5. Отправить или честно остановиться

По умолчанию вызов идёт в локальный test transport. Live mode требует ещё и
разрешения оператора/провайдера. Перед submission повторно проверяется отмена;
затем пишется durable submitting. Каждое сообщение получает body unsubscribe
и one-click headers. Подтверждённое SMTP принятие означает submitted, не доставку
во входящие и не рост reputation.

Неоднозначный timeout после submission — unknown_delivery, без слепого resend.
Письмо, уже принятое SMTP, нельзя отозвать; UI объясняет эту границу.

## Шаг 6. Найти ответ и прекратить следующие шаги

IMAP worker читает bounded headers и сопоставляет sender + Message-ID references.
Reply event и cursor записываются атомарно; повтор не дублирует событие.
Следующие queued steps отменяются. Сбой UIDVALIDITY требует безопасного rescan,
stale IMAP блокирует новые campaign sends, пока состояние неизвестно.

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
Для n<30 показываются raw counts. Sandbox не называется настоящей выручкой.

## Что проверено сейчас

Три самостоятельных CJM: Chromium desktop/mobile, keyboard, consent gates,
limits, reply pause, complaint/suppression, escaping и mutation запуска — pass.
32 сценария спецификации имеют алгоритмы; 12 growth BDD сохранены.
Independent specification validation, product build/integration tests и full
application E2E ещё ожидаются. Здесь будут добавлены реальные source/build receipts,
а не переписан planned процесс как будто уже работающий.
