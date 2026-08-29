# FR-012 · Псевдокод

## Схема (миграция)

```sql
alter table testimonials
  add column if not exists transcript_attempts int not null default 0,
  add column if not exists transcript_next_attempt_at timestamptz;
```

Обе колонки нужны в СХЕМЕ, а не в памяти (FR-012.4): воркер перезапускается, и счётчик
в процессе означал бы, что каждый перезапуск обнуляет историю попыток.

`transcript_status` не меняется: `pending` уже допускает возврат в очередь
(`003_core.sql:63`), новых значений вводить не требуется.

## Выборка — срок в УСЛОВИИ, а не в коде после

```sql
SELECT id, video_object_key, transcript_attempts
  FROM testimonials
 WHERE transcript_status = 'pending'
   AND video_object_key IS NOT NULL
   -- NFR-012.2/012.3: строка со сроком в будущем не выбирается ВООБЩЕ. Проверка после
   -- выборки означала бы, что воркер берёт строку, отпускает и берёт снова — цикл
   -- вхолостую, сжигающий соединение и квоту.
   AND (transcript_next_attempt_at IS NULL OR transcript_next_attempt_at <= now())
 ORDER BY created_at
 FOR UPDATE SKIP LOCKED
 LIMIT 1
```

`SKIP LOCKED` и `ORDER BY created_at` сохраняются. Голодания не возникает: строка,
ожидающая срока, из выборки исключена и очередь до неё не доходит.

## Обработка сбоя

```
catch (err):
    attempts = row.transcript_attempts + 1
    # [v3] Срок НЕ вычисляется здесь отдельным запросом. Он вычисляется СЕРВЕРОМ БД
    # ВНУТРИ самого UPDATE — см. «Где вычисляется срок» ниже. Причина не в изяществе:
    # запрос до ROLLBACK уходит в ОБРЕЧЁННУЮ транзакцию и подменяет исходную ошибку.

    if err is SttApiError:
        if attempts >= MAX_ATTEMPTS:
            UPDATE testimonials SET transcript_status = 'failed',
                                    transcript_attempts = attempts
             WHERE id = row.id
            COMMIT
            return { status: "failed", testimonialId: row.id }

        # Строка ОСТАЁТСЯ pending — это и есть возврат в очередь.
        UPDATE testimonials SET transcript_attempts = attempts,
                                transcript_next_attempt_at = deadline
         WHERE id = row.id
        COMMIT
        return { status: "retry_scheduled", testimonialId: row.id, attempts }

    # [v2] НЕ SttApiError: причина не в провайдере. Текущее поведение — ROLLBACK и
    # проброс — СОХРАНЯЕТСЯ: помечать отзыв failed из-за, скажем, обрыва соединения
    # с БД было бы неверно, и это зафиксировано в transcribe-job.ts:124-126.
    ROLLBACK

    # Но и «оставить как есть» нельзя: строка остаётся pending, ORDER BY created_at
    # выбирает ЕЁ ЖЕ на каждом тике, и одна ядовитая запись блокирует всю очередь
    # навсегда. Поэтому попытка учитывается ОТДЕЛЬНОЙ короткой транзакцией.
    #
    # Отдельной — потому что предписывать UPDATE в транзакции, откатываемой из-за
    # обрыва соединения, значит предписать невыполнимое ровно тогда, когда оно
    # предписано (NFR-012.7). Здесь это попытка «по возможности»: не вышло — значит
    # БД действительно недоступна, и делать больше нечего.
    # ТОТ ЖЕ client, не новый из пула: брать второе, пока первое ещё не отпущено
    # (release в finally), значило бы удерживать ДВА соединения на каждый сбой и вдвое
    # резать ёмкость пула именно тогда, когда сбои идут потоком.
    #
    # [v3] ROLLBACK обёрнут: если он сам упал, соединение НЕПРИГОДНО, и его нельзя
    # возвращать в пул молча — release(err) заставляет pg уничтожить клиента, а не
    # вернуть отравленным. Без этого пул из 10 деградирует по одному соединению за
    # случай, и на нём падает любой следующий запрос, включая BEGIN.
    try: ROLLBACK
    catch: poisoned = true

    if poisoned: rethrow original   # finally сделает release(err), см. 03_architecture

    try on THE SAME client, new transaction:
        if attempts >= MAX_ATTEMPTS:
            # Исчерпали. failed здесь означает «мы перестали пытаться», а не
            # «провайдер отверг». Иного значения enum не даёт, а вечный pending —
            # это вечная ядовитая строка.
            UPDATE testimonials SET transcript_status = 'failed',
                                    transcript_attempts = attempts WHERE id = row.id
        else:
            UPDATE testimonials SET transcript_attempts = attempts,
                                    transcript_next_attempt_at = deadline WHERE id = row.id
    catch: ignore   # БД недоступна — исходную ошибку не теряем

    rethrow          # супервизор обязан увидеть, а не проглотить
```

## [v3] Где вычисляется срок — NFR-012.6, NFR-012.8

**Внутри `UPDATE` новой транзакции, сервером БД.** Не переменной в JS, не отдельным
`SELECT` до отката:

```sql
UPDATE testimonials
   SET transcript_attempts = $2,
       transcript_next_attempt_at = clock_timestamp() + ($3 || ' milliseconds')::interval
 WHERE id = $1
```

Отдельный `SELECT clock_timestamp()` до `ROLLBACK` уходит в **обречённую** транзакцию:
если исходная ошибка пришла от `client.query`, транзакция уже в состоянии abort, запрос
падает с `25P02` и **подменяет** исходное исключение. Тогда не выполняются ни `ROLLBACK`,
ни проброс, а `finally` вызывает `release()` без аргумента — по исходникам `pg`
(`pg-pool/index.js`) это означает: отката нет, клиент не уничтожается, **отравленное
соединение возвращается в пул** и остаётся непригодным до конца жизни процесса.

## [v2] Почему `clock_timestamp()`, а не `now()` — NFR-012.6

В Postgres `now()` — это `transaction_timestamp()`, **время начала транзакции**. Транзакция
открывается на строке 65, сетевой вызов идёт на строке 99, и по собственному комментарию
файла он «может занимать до пары минут».

Значит при вызове дольше задержки выражение `now() + interval '1 minute'` даёт момент,
который на `COMMIT` **уже в прошлом**. Строка немедленно снова спелая, три попытки уходят
подряд внутри одного прохода цикла — и «сжигание квоты STT», которое NFR-012.2 называет
причиной своего существования, происходит ИЗ-ЗА повторов, а не предотвращается ими.

Проверено на живой Postgres: при работе в транзакции 2 с и задержке 1 с выражение
`(now() + interval '1 second') <= clock_timestamp()` на выходе истинно.

В `SELECT` `now()` уместен и остаётся: там он первый оператор транзакции.

## Задержка

```
MAX_ATTEMPTS = 3        # первая + два повтора
backoff(n) = BASE * 2^(n-1)   # 1 мин, 2 мин
```

Числа названы **здесь**, а не «разумный дефолт по месту»: требование без числа
непроверяемо, и тест обязан прибивать их независимо от кода.

Верхняя граница мала намеренно: цель — пережить разовый сбой сети, а не ждать
восстановления сервиса часами. Провайдер, лежащий дольше пары минут, — это уже случай
для ручного повтора, которого в объёме нет.

## Успех

`transcript` записывается одним `UPDATE`, как и сейчас. Счётчик **не обнуляется**
(NFR-012.5): «расшифровалось с третьей попытки» — факт, полезный при разборе.
