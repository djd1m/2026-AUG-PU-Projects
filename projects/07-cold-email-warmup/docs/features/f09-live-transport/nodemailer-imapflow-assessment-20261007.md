# N7: оценка Nodemailer / ImapFlow

Дата: 2026-10-07. Статус: завершённый read-only анализ; условная рекомендация для отдельного локального прототипа, не разрешение миграции и не runtime PASS.

## Вывод

Готовые библиотеки целесообразны для сокращения сопровождения SMTP/IMAP и MIME. Рекомендуется проверить ImapFlow первым на существующих локальных протокольных fixtures; затем Nodemailer. Немедленная замена двух клиентов без адаптеров не рекомендуется. Текущая ошибка cadence относится также к числу операций и расписанию N7; библиотека сама по себе не доказывает её исправление. Архитектура N7, авторизация, квоты и обработка остановок сохраняются.

## Проверенные версии и источники

По npm registry в 2026-10-07T06:34:01Z: Nodemailer 10.0.15, MIT-0, Node>=20, без прямых runtime dependencies; ImapFlow 2.2.6, MIT, Node>=20, восемь прямых runtime dependencies. Node22 N7 удовлетворяет engines; работа зависимостей в образе ещё не проверялась. Лицензии транзитивных пакетов и security advisories не аудированы. Эти версии — проверенные кандидаты, не установленные зависимости N7.

Оба опубликованных npm tarball проверены по registry SHA512 integrity. Извлечены конкретные ESM JS исходники, package metadata и лицензии; код библиотек и lifecycle scripts не выполнялись. Источники master/dev не заменяют проверку опубликованной версии. `source-receipt.json` связывает точные версии, integrity и SHA файлов. Промежуточная коллизия имени SMTP JS/d.ts исправлена до выводов; финальный receipt содержит явные имена ESM JS members.

N7 source binding: кандидат `b6e8ae16e8feb6c67888eb2f006cfbb299b40197`, не принятый product baseline. `n7-source-receipt.json` содержит SHA выбранных файлов. Принятая ветка N7 на момент начала исследования содержала F10; текущие F11 изменения продолжаются отдельно.

Официальная документация:

- https://nodemailer.com/smtp
- https://nodemailer.com/smtp/pooled
- https://imapflow.com/docs/api/imapflow-client/
- https://registry.npmjs.org/nodemailer/10.0.15
- https://registry.npmjs.org/imapflow/2.2.6

## Что заменяется

| Слой | Кандидат | Что остаётся в N7 |
|---|---|---|
| SMTP команды, multiline ответы, AUTH, TLS/STARTTLS | Nodemailer | Submission fence, authority, результат accepted/pre-DATA/ambiguous, квоты, deadline, socket ownership |
| MIME заголовки, UTF-8 encoding, сериализация | Nodemailer composer, отдельный второй шаг | Стабильный Message-ID, unsubscribe token/headers, адреса/размеры, reply references, неизменный payload |
| IMAP CAPABILITY/AUTH/EXAMINE/UID FETCH, literals | ImapFlow | UID horizon/cursor/CAS, semantic dedup, tenant/run/grants, stop-first, bounded body/content policy |
| Подключение и lifetime | Библиотечные соединения в прежнем изолированном child | Проверка endpoint/DNS, разрешённый IP+SNI, общий deadline, подтверждённое завершение процесса/сокета, физические slots |

Измеренный кандидат содержит smtp.ts 3,599B, imap.ts 4,253B, body.ts 7,736B, message.ts 3,899B и transport-channel.ts 10,281B: суммарно 29,768B. Это размер файлов-кандидатов, не объём гарантированного удаления: они смешивают протокол, ограничения и бизнес-валидацию. Процент сокращения, производительность и стоимость перехода не измерены. Короткие физические строки в этих файлах сильно уплотнены; сравнивать только LOC некорректно.

## Совместимость: Nodemailer

Документация подтверждает implicit TLS465, обязательный STARTTLS587 через requireTLS, SNI при соединении к IP, custom getSocket, отключение чтения файлов/URL. Нужна конфигурация с проверкой сертификата, без proxy/service presets, без pooling и raw protocol logging; один envelope recipient. Тайм-ауты connection/greeting/socket не заменяют общий wall-clock deadline SMTP90s/финальной DATA30s N7.

В исходниках 10.0.15 non-pooled SMTPTransport.close() лишь снимает OAuth listeners и эмитирует close: нельзя считать transporter.close() доказательством остановки активного sendMail/socket. Нужен проверенный lifecycle через имеющийся transport child, точное закрытие соединения и подтверждённый exit перед освобождением slot. Публичный export nodemailer/lib/smtp-connection — альтернативный адаптер для более явного управления; private _action* методы не патчить.

SMTPConnection отмечает command=DATA как при отказе на DATA, так и при отказе после stream. Одна строка command=DATA не доказывает, были ли переданы байты. Классификация опирается на проверенный момент начала stream и/или устойчивый публичный контракт. Любая неопределённость остаётся ambiguous/unknown_delivery, не разрешением retry. Потеря финального250 обязательно сохраняет занятый quota и отсутствие автоматического повтора.

Предварительно безопаснее сохранить текущую MIME serialization и передавать raw message через adapter. Текущий wire уже содержит SMTP terminator и dot-stuffing; его нельзя напрямую передавать в Nodemailer как MIME raw: нужна отдельная сериализация без транспортного framing, иначе возможна двойная обработка/изменение письма. Перенос MIME composer выполняется отдельно после transport-equivalence.

## Совместимость: ImapFlow

API поддерживает readOnly mailboxOpen/getMailboxLock (EXAMINE), UID fetch, uidValidity/uidNext, headers/bodyStructure/bodyParts, частичные bodyParts start/maxLength; исходный fetch.js использует BODY.PEEK. Один connection/instance на ограниченную операцию в прежнем child, disableAutoIdle/disableCompression, logger=false/logRaw=false, TLS certificate validation и разрешённый IP с явным servername. Новые persistent connections/IDLE или иные cap/window changes не входят в эту замену.

Mailbox lock ImapFlow сериализует команды внутри экземпляра; он не заменяет PostgreSQL global lock, owner/generation fence или межпроцессные slots N7. fetch async iterator требует завершения до следующей команды; нельзя запускать вложенные операции внутри iterator. UID range должен быть числовым и ограниченным, с uid:true; не переносить sequence numbers вместо UID. Horizon фиксируется по аутентифицированному snapshot, sparse UID gaps проверяются как существующими тестами.

Критический нерешённый вопрос: partial FETCH maxLength ограничивает запрос к нормальному серверу, но не доказывает предел allocation при oversized/malicious literal. В прочитанных выбранных исходниках не подтверждён публичный настройочный maxLiteralSize. Нужен отдельный fault witness по огромному literal/обманному BODYSTRUCTURE, memory bound и корректному закрытию. При отсутствии поддерживаемого bounded parser/streaming решения кандидат не принимается: не заменять проверку успешным обычным fetch и не патчить private parser.

close() присутствует и немедленно инициирует закрытие; slot освобождается только по уже принятому N7 close/exit proof, а не по факту вызова close(). Получение и публикация plain text/MIME структуры остаются ограниченными политикой F11.

## Минимальный прототип и критерии решения

1. Отдельный MEDIUM автор, isolated tree и pinned dependencies, без изменений active N7 source/DB/public preview. Сохранить интерфейсы адаптеров и повторно использовать fixtures; никакого live SMTP/IMAP или нового spend.
2. ImapFlow: readOnly UID snapshot/header/body; TLS/IP pinning; UIDVALIDITY reset, sparse/missing/duplicate/out-of-range UIDs; bounded literal/oversized metadata/text; deadline, abort и физическое закрытие; отсутствие side effects Seen/STORE/EXPUNGE; текущие authority/privacy/TTL проверки.
3. Nodemailer: TLS465/STARTTLS587/auth; header/body equivalence; pre-DATA transient/permanent, DATA rejection, потерянный финальный250, slow/trickle reply, cancellation во время connect/auth/body, никаких duplicate sends; стабильные Message-ID/unsubscribe и bounded wire size.
4. Fresh HIGH reviewer получает planner requirements + frozen candidate/raw receipts без coder history. Сравнить результаты и удалённый протокольный код, dependency/licence footprint, реальные socket counts, memory и duration на тех же нагрузках.
5. При подтверждённой совместимости интегрировать по одному адаптеру, убрать заменённый протокольный путь после регрессии. F11 не считать принятым только по внедрению библиотеки. Если нужны private patches либо теряются доказательства bounds/unknown_delivery, отказаться от соответствующей замены и записать конкретный blocker.

Существующие 300s healthy/fault workloads, ALL30 readiness и HEADER<=30s остаются обязательными для принятия актуального runtime; обещания ускорения сейчас нет. Проверка API/source не является benchmark или runtime acceptance. Model actual/usage/cost анализа неизвестны (null); использован root executor без утверждения о переключении модели.
