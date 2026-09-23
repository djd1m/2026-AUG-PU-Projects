# Ревью 02 · Разделяемые ресурсы, конкурентность, фенс попыток

**Область:** фичи 3 (`queue-and-probe`), 6 (`render-and-watermark`), сторож `apps/web/src/server/watchdog.ts`,
общий слой попыток `packages/db/src/{attempts,probe,transcription,selection,render}.ts`,
резерв диска `apps/worker/src/media/download.ts`.

**Режим:** cross-family review (OWN-002). Код и тесты к нему написаны семейством OpenAI; 490 зелёных
тестов — утверждение автора о собственной работе, здесь оно не принимается как доказательство.

**Как проверялось:** чтение исходников; отчёты `07_code_report.md` использованы только как указатель.
Две гипотезы о семантике PostgreSQL проверены ЭКСПЕРИМЕНТАЛЬНО на одноразовом контейнере
`postgres:16.4-alpine` без публикации порта (удалён после прогона) — протоколы приведены в находках
RC-001 и RC-002. Живой стенд проекта не трогался.

**Вердикт: вернуть** — по двум пунктам: RC-001 (доказанное «прочитать, потом записать» на
разделяемом ресурсе) и RC-002 (весь набор конкурентных тестов области идёт на конфигурации, в которой
проверяемый исход не может проявиться). Архитектура фенса в остальном верна и подтверждена.

---

## Находки

### RC-001 · `authorizeSttCall` считает счётчик попыток из снимка, который блокировка не обновляет

**Серьёзность: средняя** (деньги + потолок попыток; узкая достижимость).

**Утверждение.** `authorizeSttCall` — единственное место в слое попыток, где значение, прочитанное
ИЗ ТОГО ЖЕ оператора, что берёт блокировку, используется для вычисления записи. Блокировка
`FOR UPDATE OF v` обновляет только строку `video`; присоединённая строка `job_attempt` приходит из
снимка, взятого ДО ожидания на блокировке. Это ровно запрет из
`shared-resource-verification.md`: «прочитать, потом записать» на разделяемом ресурсе.

**Доказательство — код.**

`packages/db/src/transcription.ts:9-12` — блокировка берётся оператором, который в том же SELECT
читает `j.stt_calls`:

```
SELECT v.account_id,v.duration_seconds,v.minutes_charged,j.stt_calls,j.started_at
  FROM video v JOIN account a ... JOIN job_attempt j ON j.video_id=v.id AND j.fence=$2
  WHERE ... FOR UPDATE OF v
```

`packages/db/src/transcription.ts:43` — `const previous = row.stt_calls[String(chunkIndex)] ?? 0;`
`packages/db/src/transcription.ts:44` — на `previous` стоит потолок `STT_MAX_ATTEMPTS` (=3,
`packages/shared/src/transcript.ts:7`);
`packages/db/src/transcription.ts:46` — на `previous` стоит развилка списания квоты: при
`previous === 0` минуты НЕ списываются вовсе;
`packages/db/src/transcription.ts:55-56` — обратная запись `jsonb_set(stt_calls, [chunk], previous+1)`
без условия актуальности.

**Доказательство — прогон на PostgreSQL 16.4.** Две сессии, схема повторяет `lockCurrent`
(`video` под `FOR UPDATE OF v`, присоединённая `job_attempt` без блокировки). A берёт блокировку,
B входит в тот же оператор и ждёт; A пишет `stt_calls={"0":2}` и коммитит; B разблокируется:

```
=== A ===  A reads stt_calls={"0": 1}
=== B ===  B reads stt_calls={"0": 1}          <- прочитано ПОСЛЕ коммита A
           B sees table truth={"0": 2}          <- следующий оператор той же транзакции B
```

Значение в операторе, взявшем блокировку, — до-блокировочное; значение в СЛЕДУЮЩЕМ операторе той же
транзакции — свежее. Это и есть граница, которую нарушает только `authorizeSttCall`.

**Что из этого следует.** При двух одновременных исполнениях одной попытки и одного чанка:

| `previous` в снимке | Что произойдёт |
|---|---|
| `0` (первая отправка чанка) | обе ветки минуют списание минут (`:46`), уходят ДВА платных вызова Whisper, оплачен один; счётчик становится `1`, а не `2` |
| `>0` (повтор после отказа провайдера) | квота спишется дважды (это верно), но счётчик обе записи сведёт к `previous+1` — потолок `STT_MAX_ATTEMPTS` недосчитывает попытку |

**Почему это не гипотеза о PostgreSQL, а расхождение внутри проекта.** Автор ЗНАЕТ про этот механизм
и защитился от него в соседнем файле: `packages/db/src/selection.ts:44-45` — комментарий
«The joined SELECT can carry an older job_attempt snapshot while waiting for video. Only this
conditional UPDATE grants the right to spend», и `:46-48` — атомарный захват
`UPDATE job_attempt SET llm_dispatched=true WHERE ... AND llm_dispatched=false RETURNING`.
Это тот самый блокер фичи 5, о котором говорит постановка; в `authorizeSttCall` он не закрыт.

**Достижимость.** Нужны два одновременных исполнения одной `stt`-попытки. `jobId` = `stt:video:fence`
(`packages/queue/src/queues.ts:17-22`) дедуплицирует доставку, поэтому путь один: пере-доставка
подвисшего задания BullMQ (`maxStalledCount: 1`, `apps/worker/src/runtime.ts:64`) при живом первом
исполнителе. Вероятность невысокая — но весь фенс построен именно на допущении «доставлено дважды»
(тест `queue-probe.integration.test.ts:70` носит имя `MANDATORY concurrency`), и по этому же
допущению находка обязана быть закрыта.

**Не покрыто тестами.** `stt_calls` фигурирует только в `tests/transcription-quota.test.ts:14,27,33,41`
— на замоканном пуле, последовательно. Единственный конкурентный тест
(`tests/transcription.integration.test.ts:59-65`) зеленеет потому, что квота исчерпана и лишние
вызовы отсекает атомарный `UPDATE quota_counter` (`packages/db/src/quota.ts:30-31`), а не счётчик.
Тест доказывает атомарность КВОТЫ, не счётчика.

**Действие.** Заменить вычисление `previous` из снимка на атомарный захват по образцу
`selection.ts:46-48`: инкремент и проверку потолка выполнять одним условным `UPDATE ... RETURNING`
над `job_attempt` (например `jsonb_set` от текущего значения строки с условием
`(stt_calls->>$chunk)::int IS NOT DISTINCT FROM $previous`, либо инкремент прямо в SQL с
`WHERE COALESCE((stt_calls->>$chunk)::int,0) < 3 RETURNING`), и ветку списания квоты решать по
ВОЗВРАЩЁННОМУ значению. Плюс тест на настоящей БД: два `authorizeSttCall` через `Promise.all` при
ЗАВЕДОМО достаточной квоте — сегодня он покажет красный.

---

### RC-002 · Конкурентные тесты области идут на пуле БЕЗ `statement_timeout`, которым живёт продакшен

**Серьёзность: средняя** (подрывает доказательную силу всего конкурентного набора фич 3/5/6).

**Утверждение.** Продакшен-пул отменяет любой оператор через 5 с, включая ожидание на блокировке
строки. Интеграционные тесты, которые проверяют поведение проигравшего в гонке, строят пул БЕЗ этого
параметра — то есть проверяют исход «дождался и корректно получил `false`/`null`», которого в
продакшене не будет, если победитель держит блокировку дольше 5 с.

**Доказательство — конфигурация.**

`packages/db/src/index.ts:6-7` (продакшен):
`new Pool({ ..., connectionTimeoutMillis: 3000, statement_timeout: 5000, ... })`

Пулы тестов:

| Файл | Строка | `statement_timeout` |
|---|---|---|
| `tests/render.integration.test.ts` | 15 | **нет** |
| `tests/queue-probe.integration.test.ts` | 29 | **нет** |
| `tests/transcription.integration.test.ts` | 26 | **нет** |
| `tests/selection.integration.test.ts` | 28 | **нет** |
| `tests/retention.integration.test.ts` | 19 | **нет** |
| `tests/limits.integration.test.ts` | 18 | `5000` — единственный совпадающий с продакшеном |

**Доказательство — прогон на PostgreSQL 16.4.** Сессия A держит `SELECT id FROM video ... FOR UPDATE`
8 с; сессия B с `SET statement_timeout = 5000` входит в тот же оператор:

```
ERROR:  canceling statement due to statement timeout
CONTEXT:  while locking tuple (0,5) in relation "video"
```

То есть проигравший в продакшене получает не `false`, а ошибку драйвера.

**Где это меняет проверяемый исход.** `tests/render.integration.test.ts:54-61` —
тест «publication locks out retry until its acceptance» УДЕРЖИВАЕТ публикацию открытой и утверждает,
что параллельный `retryRender` дождётся и вернёт `null`. На продакшен-пуле при публикации дольше 5 с
тот же `retryRender` выбросит `canceling statement due to statement timeout`. Тест зелен именно
потому, что в нём выключен параметр, который решает исход. Это форма из
`guard-must-be-able-to-fail.md`: проверка не способна показать красное на том состоянии, ради
которого написана.

**Действие.** Строить тестовые пулы через ту же `createPool` (или по крайней мере с
`statement_timeout: 5000` и `connectionTimeoutMillis: 3000`), затем перепрогнать конкурентные тесты
фич 3/5/6 и зафиксировать, какие из них перестанут быть зелёными. Отдельно решить, ЧТО должно
происходить с проигравшим: сегодняшний код не отличает «опоздал» от «не дождался блокировки».

---

### RC-003 · Публикация рендера делает две загрузки в S3 ВНУТРИ транзакции, удерживая блокировку строки `video`

**Серьёзность: средняя.**

**Утверждение.** Сетевой вызов длительностью до 120 с выполняется, пока открыта транзакция и
удерживаются блокировки `video`, `clip`, `job_attempt` и соединение из пула (`max: 10`). Это
канонический запрет из `security-operation-order.md`: «Сетевой вызов ↔ транзакция → Вызов ВНЕ
транзакции», и вопрос №1 из `shared-resource-verification.md`: удержание, длительностью которого
управляет не наш код.

**Доказательство.**
`packages/db/src/render.ts:74-76` — `transaction(pool, async tx => { if (!await lockRender(tx, attempt)) ...; const bytes = await publish(); ... })`;
`apps/worker/src/workers/render.ts:42-47` — `publish` кладёт в S3 mp4 и превью под
`uploadSignal = AbortSignal.any([signal, AbortSignal.timeout(120_000)])`, то есть удержание ограничено
120 с, но не 5 с;
`packages/db/src/index.ts:6-7` — `statement_timeout: 5000`; ни в compose, ни в коде нет
`idle_in_transaction_session_timeout` (проверено grep'ом по `packages`, `apps`, `docker-compose.yml`,
`scripts` — единственные совпадения это `statement_timeout`), то есть транзакция в состоянии
«idle in transaction» ничем не ограничена.

**Кто стоит в очереди за тем же ресурсом.** Все операции над этим `video`, берущие `FOR UPDATE`:
`lockProbe` (`probe.ts:15-21`), `lockCurrent` (`transcription.ts:8-14`, `selection.ts:10-16`),
`leaseAttemptTx` (`attempts.ts:14`), `VideoRetryService.retry` (`apps/web/src/server/video-retry.ts:17-18`).
Сторож не пострадает: его выборка зависших идёт с `SKIP LOCKED` (`watchdog.ts:13`), а
`readPending` — обычный SELECT без блокировки (`watchdog.ts:29-36`). Практическая жертва — владелец,
нажавший «повторить» во время публикации: он получит ошибку драйвера по RC-002, а не чистый 409.
Соседние клипы сегодня не конкурируют: `concurrency: 1` и одна реплика `worker-video`.

**Почему это исправимо дёшево.** Блокировка здесь НЕ несёт защиты хранилища — это сказано в самом
файле, `packages/db/src/render.ts:68-71`: «Storage must independently enforce create-only publication:
a connection loss releases this row lock before an in-flight PUT stops», и хранилище действительно
её обеспечивает (`apps/worker/src/render/storage.ts:14-27`: `IfNoneMatch: '*'`, на 412 —
`HeadObject` и приём только при совпадении контракта). Атомарность приёма в БД тоже обеспечивает не
блокировка, а условный оператор `WHERE ... render_fence=$3 AND status='rendering'`
(`render.ts:77-79`). То есть загрузку можно вынести ПЕРЕД транзакцией без потери ни одного свойства.

**Действие.** Вынести `publish()` наружу: загрузить в хранилище, затем открыть транзакцию и выполнить
только условный `UPDATE`. Если решено оставить как есть — измерить реальную длительность загрузки
клипа 20–75 с в MinIO и записать её рядом с `statement_timeout`, потому что связь этих двух чисел
сейчас нигде не зафиксирована.

---

### RC-004 · Резерв диска ведётся ПРОЦЕССОМ, а диск общий для всех трёх воркеров и MinIO

**Серьёзность: средняя** (на этой машине — актуальная: 94 % занято).

**Утверждение.** Правило «≥ 3× до скачивания» соблюдено и проверено, но бюджет `reserved` —
переменная модуля, то есть отдельная для каждого процесса, тогда как `statfs` возвращает свободное
место ОДНОЙ и той же хостовой файловой системы для всех.

**Доказательство.**
`apps/worker/src/media/download.ts:28` — `let reserved = 0n;` (область — модуль, то есть процесс);
`:30-41` — резерв под мьютексом: `available(directory) - reserved < required` и инкремент выполняются,
пока держится `reservationTail`, — внутри процесса это корректно;
`:9-11` — `freeBytes` = `statfs(directory)`, то есть свойство файловой системы, а не тома;
`docker-compose.yml:67,88,108` — три РАЗНЫХ именованных тома `stt-work`, `llm-work`, `render-work`.

Измерено на этой машине:

```
n5-clipmaker_stt-work    -> /var/lib/docker/volumes/... -> /dev/vda1 94% used
n5-clipmaker_llm-work    -> /var/lib/docker/volumes/... -> /dev/vda1 94% used
n5-clipmaker_render-work -> /var/lib/docker/volumes/... -> /dev/vda1 94% used
n5-clipmaker_miniodata   -> /var/lib/docker/volumes/... -> /dev/vda1 94% used
```

Разные тома, одна файловая система. `worker-stt` (concurrency 2) и `worker-video` (concurrency 1)
одновременно видят одно и то же свободное место и каждый независимо решает, что оно его. Плюс
MinIO пишет туда же оригиналы и готовые клипы, вообще не участвуя в учёте.

**Действие.** Либо назвать это принятым риском в ADR-006 явным числом (сколько процессов × сколько
максимум резервируют, и почему сумма безопасна), либо перенести учёт в общий для машины ресурс
(блокировка-файл на том же томе или консультативная блокировка PostgreSQL). Отдельно: ADR-006
исходит из «18 ГБ свободно» — на стенде сейчас 94 % занято, предпосылка ADR не выполняется, и это
надо либо вернуть в норму, либо переписать ADR.

---

### RC-005 · `N5_RENDER_CONCURRENCY` объявлена в compose и не читается никем

**Серьёзность: низкая** (ложная ручка; CFG-I5 из `honest-configuration.md`).

**Доказательство.** `docker-compose.yml:106` — `N5_RENDER_CONCURRENCY: "1"`. Поиск по всему дереву
(без `node_modules`, `.next`, `dist`) даёт ровно два совпадения: эта строка и её копия в
`tests/artifacts/foundation-fix-round2/test-db-green.txt:74`. Ни один исходник её не читает.
Значение жёстко зашито: `apps/worker/src/workers/render.ts:73` — `{ connection, concurrency: 1, maxStalledCount: 1 }`.

**Почему это не мелочь.** `docs/ADR.md:214` прямо предписывает обратное объявленному:
«Страж по коду: `concurrency` у `worker-video` — литерал `1`, не переменная окружения», и два стража
это стерегут (`tests/queue-probe-guards.test.ts:13-14`, `tests/render.test.ts:42-44`). Переменная в
compose утверждает существование ручки, которой инвариант запрещает существовать: оператор,
поставивший `N5_RENDER_CONCURRENCY=4`, не получит ни изменения, ни предупреждения.

**Действие.** Удалить строку из `docker-compose.yml`. Если хочется сохранить след решения — комментарий
со ссылкой на ADR-006, не переменная.

---

### RC-006 · Два `catch` без привязки уничтожают причину и подменяют диагноз

**Серьёзность: низкая-средняя.** Тот же класс, что ночная находка в стороже.

**6a. `packages/db/src/selection.ts:42-43`**

```
try { transcript = await readTranscript(tx, attempt.video_id, duration); }
catch { await failTx(tx, attempt, 'no_timestamps', now); return null; }
```

`readTranscript` бросает и на ошибке разбора (законный `no_timestamps`), и на ЛЮБОЙ ошибке БД —
в том числе на `canceling statement due to statement timeout` (RC-002/RC-003) и на обрыве соединения.
Преходящий отказ БД превращается в ТЕРМИНАЛЬНЫЙ отказ видео с неверной причиной, и настоящая причина
не записывается никуда. Действие: ловить с привязкой, журналировать причину, и приводить к
`no_timestamps` только ошибку разбора (`parseTranscript`), а не всё подряд.

**6b. `apps/worker/src/media/probe.ts:11-13`**

```
if (!Number.isFinite(durationSec) || durationSec <= 0 || !Array.isArray(data.streams)) throw new Error();
} catch { throw new ProbeError('probe_timeout'); }
```

Непригодный или неполный вывод `ffprobe` (например контейнер без длительности) объявляется
`probe_timeout`. `probe_timeout` входит в `FILE_FAILURES` (`packages/db/src/quota.ts:41`), то есть
влечёт возврат слота загрузки — решение принимается по подменённой причине, и отличить таймаут от
неразбираемого вывода по журналу невозможно. Действие: отдельная причина для неразбираемого вывода
либо журналирование `cause` перед подменой.

---

### RC-007 · `acceptRenderResult` — мёртвый код, и тест с меткой `MANDATORY` проверяет именно его

**Серьёзность: низкая** (дубликат покрыт; риск — в будущем расхождении).

**Доказательство.** `packages/db/src/attempts.ts:49-64` определяет `acceptRenderResult`. Поиск по
дереву: единственные импорты — `tests/queue-probe.integration.test.ts:5`, использования — строки
64, 66, 67, 73 того же файла. Продакшен-путь рендера зовёт `publishRenderResult`
(`apps/worker/src/workers/render.ts:43`, `packages/db/src/render.ts:72`).

Тест `queue-probe.integration.test.ts:70` назван «MANDATORY concurrency: render(fence=N) delivered
twice accepts exactly one UPDATE» и проверяет функцию, которую не зовёт ни один воркер. Обязательное
свойство при этом всё же покрыто — настоящей функцией, в `tests/render.integration.test.ts:36-45`.
То есть дыры в покрытии нет; есть две реализации одного правила, которые разойдутся молча.

**Действие.** Удалить `acceptRenderResult` и переписать тест на `publishRenderResult`, либо явно
пометить её как тестовый двойник.

---

### RC-008 · `transaction()`: отказ `ROLLBACK` замещает исходную ошибку, соединение возвращается в пул без пометки

**Серьёзность: низкая.**

`packages/db/src/quota.ts:6-11`:

```
catch (error) { await tx.query('ROLLBACK'); throw error; }
finally { tx.release(); }
```

Если сам `ROLLBACK` отклонён (соединение уже мертво), его ошибка вылетает из `catch` и ИСХОДНАЯ
ошибка теряется — единственный источник диагноза уничтожен. Кроме того `tx.release()` вызывается без
аргумента: `pg` уничтожает клиента только при `release(error)`. Пул — разделяемый ресурс на 10
соединений (`packages/db/src/index.ts:6`); возвращать в него клиента, чей откат не подтверждён, —
не то, чего хочет вызывающий.

**Действие.** `catch (error) { try { await tx.query('ROLLBACK'); } catch (rollback) { console.error(..., rollback); } throw error; }`
и `finally { tx.release(failed ? error : undefined); }`.

---

### RC-009 · `renderErrorMessage` не проходит цепочку `cause`, а рендер свои ошибки не перебрасывает

**Серьёзность: низкая.**

`apps/worker/src/render/diagnostics.ts:10-12` берёт только `error.message`.
`apps/worker/src/workers/render.ts:52-60` ловит ВСЁ и возвращает `'failed'`, ничего не перебрасывая,
поэтому обработчик `worker.on('failed', …)` (`apps/worker/src/runtime.ts:80`), который печатает объект
Error со стеком и `[cause]`, до отказов рендера не доходит никогда. Ошибка, обёрнутая через
`new Error(msg, { cause })`, теряет причину целиком. Частично компенсировано тем, что `execFFmpeg`
пишет отдельный богатый журнал с `stderr_tail` (`apps/worker/src/render/exec.ts:19-24`), но для
отказов хранилища и БД компенсации нет.

**Действие.** В `renderErrorMessage` пройти цепочку `cause` (с той же санацией) — редактирование
секретов при этом сохраняется, тест RD-002 останется зелёным.

---

### RC-010 · `finally { await unlink(chunk.path) }` может заместить исходную ошибку

**Серьёзность: низкая.**

`apps/worker/src/workers/stt.ts:75` — `unlink` без `force`. Если чанк не был создан (обрыв по
`signal` в середине `splitAudio`), `unlink` бросит `ENOENT` из `finally` и заместит настоящую причину.
Соседний код делает это правильно: `rm(tmp, { recursive: true, force: true })`
(`apps/worker/src/media/download.ts:54`), `rm(temp, { recursive: true, force: true })`
(`apps/worker/src/render/ffmpeg.ts:43`). Действие: `rm(chunk.path, { force: true })`.

---

## Проверено и верно

| Требование | Как проверено | Результат |
|---|---|---|
| `fence` монотонен НА ВИДЕО, общий для трёх стадий и всех серий | `packages/db/src/attempts.ts:16-21`: `fence = max(max(fence по всем попыткам видео), video.fence) + 1`, стадия и серия в вычислении не участвуют; `:31` — новое значение кладётся в `video.fence` | верно |
| Уникальна ровно пара `(video_id, fence)` | `packages/db/migrations/001_init.sql:151` — `UNIQUE (video_id, fence)`. Индекса на `(video_id, stage, attempt_no)` нет; `job_attempt_open` (`005_queue_probe.sql`) — НЕуникальный частичный индекс, ограничением не является | верно |
| Аренда попытки атомарна | `attempts.ts:14` берёт `SELECT fence FROM video FOR UPDATE` ПЕРВЫМ оператором, счётчики читаются СЛЕДУЮЩИМ (`:16-18`) — то есть уже после блокировки, свежим снимком. Это ровно та граница, которую нарушает RC-001. Подтверждено тестом с 8 параллельными арендами: фенсы 2…9 без повторов (`tests/queue-probe.integration.test.ts:50-57`) | верно |
| Результат принимается только оператором с условием актуальности | `render.ts:77-79` (`render_fence=$3 AND status='rendering'`), `attempts.ts:54-57`, `transcription.ts:68-72` (`WHERE transcript.fence < EXCLUDED.fence`), `probe.ts:24-27` | верно |
| Ноль затронутых строк → `stale_attempt_result` в аудит, а не тихая перезапись | `render.ts:75,80`; `probe.ts:36,47,68`; `transcription.ts:23,40,65,73`; `selection.ts:25,38,67`; `attempts.ts:62`; `retry.ts:7` — во всех точках отказа аудит вызывается | верно |
| Класс блокера фичи 5 (две авторизации прошли обе) в фиче 5 закрыт | `selection.ts:46-48` — атомарный захват `llm_dispatched=false → true` с `RETURNING`; подтверждено конкурентным тестом `tests/selection.integration.test.ts:58-62` (`Promise.all`, ровно один непустой) | закрыт |
| Тот же класс в аренде фичи 3 | см. выше: счётчики читаются после блокировки, отдельным оператором | отсутствует |
| Тот же класс в рендере фичи 6 | `acceptSelection` и `acceptTranscript` защищены сменой `video.status`: проверено экспериментально — при изменении собственного квалификатора заблокированной строки повторная проверка PostgreSQL отбрасывает строку (`b_rows_after_epq = 0`), поэтому проигравший получает `stale`, а не дубль. Подтверждено тестом `selection.integration.test.ts:63-68` (два `acceptSelection` → один клип) | отсутствует |
| Тот же класс в аренде попыток STT | **НЕ закрыт — RC-001** | дефект |
| `concurrency` у рендера — литерал `1`, не переменная окружения | `apps/worker/src/workers/render.ts:73` — литерал; два стража по исходнику (`tests/queue-probe-guards.test.ts:13-14`, `tests/render.test.ts:42-44`). Оговорка — RC-005 | верно |
| Резерв диска ≥ 3× ДО скачивания | `apps/worker/src/media/download.ts:36-39` (`3n * bytes`), вызывается в `:45` ПЕРЕД `mkdtemp`/`download` в `:49-51`. Проверка и инкремент — под мьютексом `reservationTail` (`:30-34,40`), то есть не «прочитать, потом записать». Оговорка — RC-004 | верно |
| На пути `deferred` обращений к S3 — НОЛЬ | `download.ts:45-46`: при отказе резерва возврат `{ deferred: true }` до `mkdtemp` и до `download`. Подтверждено тестами `tests/render-worker.test.ts:25-31` и `tests/queue-probe.integration.test.ts` («probe orchestration checks disk before GET»): `download` не вызывался, каталог пуст | верно |
| `deferred` двигает `updated_at` | `probe.ts:42` (`UPDATE video SET updated_at=$3`), `render.ts:38` (`UPDATE video SET updated_at=now()`). Есть и отдельный пульс для явно переданной транскрипции: `probe.ts:73-77`. Подтверждено тестом «deferred refreshes updated_at; watchdog preserves it» | верно |
| Сторож — синглтон процесса | `apps/web/src/server/queue-runtime.ts:22-23` — ранний возврат по `globalThis.n5WatchdogStop`; запуск ровно один, из `apps/web/src/instrumentation.ts:5` (регистрация процесса, не запрос). Плюс защита от нахлёста проходов: `watchdog.ts:58-62` (флаг `running`). Ретенция дополнительно взята под `pg_try_advisory_lock(50921012)` — межпроцессный синглтон | верно |
| Сторож при нескольких репликах web | `watchdog.ts:13` — `FOR UPDATE SKIP LOCKED`; `:23-26` и `:29-36` идемпотентны; `enqueue` дедуплицирует по `jobId` (`queues.ts:17-22,33-42`) | безопасно |
| Временный каталог чистится в `finally` | `download.ts:53-55` — после успеха и после отказа, освобождение резерва во вложенном `finally`; `render/ffmpeg.ts:43` — свой каталог субтитров. Подтверждено тестами `render-worker.test.ts:30,37,43` (`readdir(directory)` пуст во всех трёх исходах). Оговорка — RC-010 | верно |
| Рендер дочерним процессом | `apps/worker/src/render/exec.ts:12` — `spawn('ffmpeg', …)`, `stdio` третий канал `pipe`, `stderr` ограничен 64 КБ (`:25-29`); `media/probe.ts:17` — `execFile('ffprobe', …)`. Цикл событий не занят, поэтому продление блокировки BullMQ не срывается и повторного запуска той же работы через 30 с не происходит | верно |
| Сторож не уничтожает причину отказа | `watchdog.ts:52-55` (`step` + исходная ошибка, переброс), `:44`, `:62`; покрыто WD-001 (`tests/watchdog-diagnostics.test.ts:20-93`), в том числе `rejects.toBe(error)` — тождество, не только текст | исправлено верно |
| Конкурентные тесты действительно параллельны | проверено глазами: `Promise.all`/`allSettled` над ОДНИМ ресурсом в `queue-probe.integration.test.ts:52,55,73,86`, `render.integration.test.ts:40`, `selection.integration.test.ts:47,59,64`, `transcription.integration.test.ts:62,76`. Ни одного «конкурентного» теста, который на деле последователен, не найдено. Оговорка — RC-002: конфигурация пула | параллельны |

---

## Не смог проверить

| Что | Почему |
|---|---|
| Прогон 490 тестов и повторение находок красным | тесты требуют `DATABASE_URL` на `*_test` и поднятого стенда; область ревью — только отчёт, код и стенд не трогались. RC-001 доказан на отдельном одноразовом PostgreSQL той же версии (`postgres:16.4-alpine`), не на наборе тестов проекта |
| Реальная длительность загрузки клипа в MinIO (число для RC-003) | требует прогона рендера на стенде; без него связь «120 с удержания против `statement_timeout` 5 с» показана как механизм, но не измерена |
| Достижимость RC-001 через пере-доставку подвисшего задания BullMQ | требует контролируемого срыва продления блокировки на живом воркере. Механизм назван (`maxStalledCount: 1`, `apps/worker/src/runtime.ts:64`), сам сценарий не воспроизведён |
| Поведение при нескольких репликах `worker-video` | в `docker-compose.yml` реплик нет; конкуренция соседних клипов за строку `video` (RC-003) сегодня не возникает и станет актуальной только при второй реплике, о которой говорит ADR-006 |
| Ветка `probeSource` для `row.status='transcribing' && !continueTranscription` (`stt.ts:100-102`) | в продакшене `continueTranscription` передаётся всегда (`apps/worker/src/runtime.ts:46`), поэтому ветка достижима только из тестов; её поведение под конкурентностью не оценивалось |
| Деньги, гость, ретенция, загрузка, партнёрские коды | вне назначенной области; пересечения названы там, где они влияют на конкурентность (RC-006a в `selection.ts`, RC-008 в `quota.ts`) |

---

## Вердикт

**вернуть.**

Архитектура фенса верна и подтверждена независимо: одна монотонная последовательность на видео,
уникальность ровно по `(video_id, fence)`, приём результата только условным оператором, аудит
`stale_attempt_result` во всех точках отказа, атомарная аренда, резерв диска до обращения к
хранилищу, очистка в `finally`, рендер дочерним процессом, сторож-синглтон с сохранённой причиной
отказа. Блокирующих дефектов не найдено.

Возврат — по двум пунктам, и они связаны:

1. **RC-001** — единственное в слое попыток «прочитать, потом записать» на разделяемом ресурсе,
   доказанное прогоном на PostgreSQL 16.4, в месте, где тот же автор уже закрыл этот класс в
   соседнем файле и оставил там комментарий с описанием механизма.
2. **RC-002** — набор, который должен был поймать такое, идёт на пуле без `statement_timeout`,
   которым живёт продакшен; на нём проигравший в гонке ведёт себя иначе, чем в бою.

Первое — дефект. Второе — причина, по которой «490 зелёных» не является ответом на первое.
RC-003 и RC-004 не блокируют поставку, но должны получить измерение или явную запись в ADR до
второй реплики `worker-video`. RC-005 — удалить одной строкой.

Status: completed
