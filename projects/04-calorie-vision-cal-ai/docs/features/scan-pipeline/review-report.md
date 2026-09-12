Reviewer family: codex
Spec revision: sha256:3d15453d677b7ea7c282ce522e5b2bc20d3dd011b985b52817d3f6e58de683d4

# Review — scan-pipeline

## Verdict

CHANGES_REQUIRED — рабочий провайдер не подключён, нарушены учёт квоты и гарантии очистки, заявленное закрытие всех критериев не подтверждается тестами.

Проверена ревизия `27cc349e1ce891e03c1788095999bcaebc43c940`, диф относительно `5ef217c`. `npm test`: **85 passed, 12 файлов, exit 0, 9,01 с**. Интеграционные и конкурентные тесты **не запускал: требует стенд PostgreSQL/MinIO**. Они исключены из обычного `npm test`. `unverifiable` ниже означает недостаточность доказательства полного сценария.

## Spec conformance

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-scan-pipeline-1 | unverifiable | `tests/integration/routes/scans.test.ts`, «AC-1: невалидная сигнатура — 422 invalid_image, ничего не создано, квота не тронута»; требует стенд. |
| AC-scan-pipeline-2 | met | `tests/unit/photo/validate-content.test.ts`, «validateContent отвергает decompression-bomb ДО декодирования»; проходит, проверка предшествует `isDecodable`. |
| AC-scan-pipeline-3 | unverifiable | `tests/integration/routes/scans.test.ts`, «AC-3: файл сверх 12 МБ — 413, квота не списана» и отдельный тест малого разрешения; требует стенд. |
| AC-scan-pipeline-4 | met | `tests/unit/photo/validate-content.test.ts`, «отвергает отсутствие заголовка», «отвергает непригодную форму "not-a-uuid"»; маршрут возвращает 422 до квоты. |
| AC-scan-pipeline-5 | unverifiable | `tests/integration/routes/scans.test.ts`, «AC-5/6: повтор с ТЕМ ЖЕ Idempotency-Key возвращает ТОТ ЖЕ scan_id, квота не увеличивается повторно»; провайдер не запускается и не считается. |
| AC-scan-pipeline-6 | unverifiable | `tests/concurrency/scans-routes.test.ts`, «два одновременных POST…»; `Promise.all` присутствует, но измеряется квота, а не число вызовов провайдера. |
| AC-scan-pipeline-7 | not met | `tests/integration/routes/scans.test.ts`, «AC-7/20: квота исчерпана…» не доказывает гарантированную очистку; `purgeOrphanObjects` не подключён. |
| AC-scan-pipeline-8 | unverifiable | `tests/concurrency/scans-routes.test.ts`, «ровно 10 получают 202, ровно 10 получают 429(scope=user), used = 10»; параллельные запросы есть, прогон требует стенд. |
| AC-scan-pipeline-9 | unverifiable | `tests/unit/photo/normalize.test.ts`, «декодирует HEIF-контейнер (AVIF/AV1…)»; проверяется AVIF вместо HEVC-HEIC, без вызова провайдера. |
| AC-scan-pipeline-10 | unverifiable | `tests/unit/recognize/recognize-scan.test.ts`, «нормализация упавшая на normalize…» подставляет готовый отказ; отдельный тест битых байтов не проверяет полный требуемый исход. |
| AC-scan-pipeline-11 | not met | `tests/unit/recognize/validate-ranges.test.ts` проверяет три значения; `recognize-scan.ts:190` отбрасывает имя нарушенного поля. |
| AC-scan-pipeline-12 | met | `tests/unit/recognize/recognize-scan.test.ts`, «confidence = 0.59 — эскалация ВЫПОЛНЯЕТСЯ…» и «confidence = 0.60 — эскалация НЕ выполняется…»; проверяются фактические обращения. |
| AC-scan-pipeline-13 | not met | `tests/concurrency/recognize/escalation-parallel.test.ts`, «РОВНО один вызов получает granted…» вызывает только квоту; требуемого счётчика обращений к адаптеру нет. |
| AC-scan-pipeline-14 | met | `tests/unit/recognize/recognize-scan.test.ts`, «601-я эскалация…»; подменённый порт, `done`, confidence 0.3 и требуемая причина; по коду второй вызов исключён. |
| AC-scan-pipeline-15 | not met | `tests/unit/recognize/recognize-scan.test.ts`, «еда распознана с ЛЮБЫМ confidence…» проходит; обязательного стража по исходнику для запрета `done` без совпадений нет. |
| AC-scan-pipeline-16 | unverifiable | `tests/unit/recognize/recognize-scan.test.ts`, «провайдер недоступен…» проверяет статус; отдельный сценарий таймаута и сохранение реального счётчика отсутствуют. |
| AC-scan-pipeline-17 | not met | `tests/concurrency/recognize/stale-lease-real-delay.test.ts`, «воркер A получает ответ ПОЗЖЕ…» воспроизводит гонку, но подавляет журнал; текущий fence в аудит вообще не передаётся, две оплаты не проверены. |
| AC-scan-pipeline-18 | unverifiable | `tests/integration/routes/scans.test.ts`, «AC-18: чужой и несуществующий id дают ОДИН и тот же 404»; проверка корректная, требует стенд. |
| AC-scan-pipeline-19 | not met | `tests/integration/photo/purge-orphans.test.ts`, «AC-19/31: объект БЕЗ строки photo, СТАРШЕ часа…» вручную вызывает функцию, которую приложение не запускает. |
| AC-scan-pipeline-20 | unverifiable | `tests/integration/routes/scans.test.ts`, «AC-7/20: квота исчерпана…»; транзакционный откат виден по коду, проверка не считает строки `photo` и требует стенд. |
| AC-scan-pipeline-21 | unverifiable | `tests/unit/recognize/recognize-scan.test.ts`, «fence=2…» и «fence=2, квота отказала…»; только инъецированная квота, требуемый конкурентный сценарий отсутствует. |
| AC-scan-pipeline-22 | unverifiable | `tests/integration/recognize/sweep-stuck-scans.test.ts`, «lease_fence = 3, аренда истекла…»; нет проверки последующей записи опоздавшего воркера, требуется стенд. |
| AC-scan-pipeline-23 | unverifiable | `tests/integration/recognize/sweep-stuck-scans.test.ts`, «queued дольше 5 минут…» и отдельная идемпотентность; требует стенд. |
| AC-scan-pipeline-24 | met | `tests/unit/photo/decode-check.test.ts`, «правдоподобная сигнатура HEIC-контейнера с битым битстримом…»; проходит, маршрут проверяет декодируемость до хранения и транзакции. |
| AC-scan-pipeline-25 | unverifiable | `tests/unit/photo/normalize.test.ts`, «результат нормализации физически повёрнут…» проходит; отдельной многокадровой HEIC-фикстуры нет. |
| AC-scan-pipeline-26 | not met | Локальное воспроизведение буквальных времён: возраст 60 с → `failed(timeout)`, списаний 0, вызовов 0; заявленное списание нового дня недостижимо. |
| AC-scan-pipeline-27 | not met | `tests/unit/observability/model-calls-aggregator.test.ts`, «непарный START старше грейс-периода…» проверяет готовые строки; синхронная запись START не реализована. |
| AC-scan-pipeline-28 | met | `tests/unit/match/null-port.test.ts`: контрактный и поведенческий тесты разделены; конкретный `foodItemId` проверяет только поведенческий тест. |
| AC-scan-pipeline-29 | met | `tests/unit/recognize/recognize-scan.test.ts`, «второй вызов ModelProvider.recognize получает model=sonnet-5»; проходит. |
| AC-scan-pipeline-30 | unverifiable | `tests/integration/routes/scans-object-ownership.test.ts`, «объект отклонённой попытки B удалён…» проверяет существование A, но не отсутствие B; требуется стенд. |
| AC-scan-pipeline-31 | not met | `tests/integration/photo/purge-orphans.test.ts`, сценарии старше/младше часа; производственный прогон уборки отсутствует. |
| AC-scan-pipeline-32 | unverifiable | `tests/unit/recognize/recognize-scan.test.ts`, «пересечение полуночи: fence=1…» проверяет только число вызовов мока, без дня списания и неизменности счётчика D. |
| AC-scan-pipeline-33 | not met | Локально отмена во время `putNormalized` → `{ok:true}`; тест границы размера проверяет JPEG-скелет без декодирования, выходные пороги импортируются из `CANON`. |
| AC-scan-pipeline-34 | not met | `tests/unit/observability/model-calls-aggregator.test.ts`, «считает попытки…» проходит; требуемого `model-calls.sh <дата>` нет, `.cjs` принимает файл без фильтра суток. |
| AC-scan-pipeline-35 | not met | `tests/unit/match/composite-parts.test.ts`, «parts[] несут РАЗНЫЕ source_snapshot…» проверяет собственный двойник; производственный обработчик снимки частей не читает. |
| AC-scan-pipeline-36 | unverifiable | `tests/integration/recognize/sweep-stuck-scans.test.ts`, «sweeper НЕ изменяет задание с ЖИВОЙ арендой…»; предикат корректен по коду, прогон требует стенд. |
| AC-scan-pipeline-37 | met | `tests/unit/recognize/recognize-scan.test.ts`, два теста `remaining < 8000` / `>= 8000`; код пропускает эскалацию либо пересчитывает дедлайн после квоты. |
| AC-scan-pipeline-38 | met | `tests/unit/recognize/recognize-scan.test.ts`, «задание старше 30 с на момент захвата…»; проходит, выход предшествует нормализации и списанию. |

## Findings

**RV-scan-pipeline-01 — blocker — `apps/recognizer/src/bootstrap.ts:65`.** `selectModelProvider(config)` вызывается без `ImageFetcher`; при `live` селектор безусловно бросает исключение даже с заданным ключом. Воспроизведено без сети. Создать загрузчик нормализованного изображения из storage, передать его селектору и проверить сборку зависимостей сервиса с подменённым HTTP-клиентом.

**RV-scan-pipeline-02 — high — `apps/recognizer/src/recognize/recognize-scan.ts:135`.** Рабочий `worker.ts` не передаёт `ipPrefix`, поэтому повторные попытки и эскалации всех пользователей списываются в общий `scope=user, scope_key=unknown/0`. Воспроизведён этот ключ. При лимите 10 десять таких попыток блокируют остальных; исходный IP-счётчик обходится. Передавать реальный префикс сессии и проверить независимые сессии с разными адресами.

**RV-scan-pipeline-03 — high — `apps/api/src/photo/purge-orphans.ts:30`.** Функция очистки сирот нигде в приложении не вызывается; производственного `listObjects` нет, lifecycle бакета в compose не настроен. После краха или ошибки best-effort-удаления объект остаётся без гарантированного срока. Подключить уборку с согласованной периодичностью. При этом учитывать `normalized_object_key`: нынешний запрос только по `object_key` сочтёт действующие нормализованные копии сиротами.

**RV-scan-pipeline-04 — high — `apps/recognizer/src/bootstrap.ts:114`.** Удаление просроченных фото проглатывает любую ошибку MinIO, после чего `purge-expired.ts:30` помечает строку `purged`. При сетевой ошибке файл остаётся, повторная уборка его больше не выбирает. Кроме того, запускается один батч 500 в сутки при разрешённых 3000 сканах: очередь удаления может постоянно расти. Различать отсутствие объекта и сбой, сохранять возможность повтора и вычитывать все просроченные батчи.

**RV-scan-pipeline-05 — high — `apps/recognizer/src/photo/normalize.ts:49`.** Сигнал отмены проверяется до преобразования, но не после него, записи объекта или обновления БД; сами операции сигнал не получают. Отмена внутри `putNormalized` воспроизводимо заканчивается `ok:true`. `recognize-scan.ts:177` также допускает неположительный остаток перед платным вызовом. Обеспечить исполнение дедлайна и проверять отмену/остаток непосредственно перед дальнейшими действиями.

**RV-scan-pipeline-06 — high — `apps/api/src/photo/validate-content.ts:131`.** Размеры VP8X читаются со смещений 26/29 вместо 24/27. Сгенерированный валидный WebP 800×600 с метаданными разбирается как 153345×4409601 и получает `decompression_bomb`, хотя декодируется успешно. Исправить смещения и добавить реальные положительные/отрицательные WebP-фикстуры.

**RV-scan-pipeline-07 — high — `apps/api/src/photo/validate-content.ts:176`.** Проверки посторонней структуры после конца изображения нет. Валидный JPEG с добавленным `<html><script>…` проходит и `validateContent`, и `isDecodable`. Комментарий теста ошибочно приписывает полиглот-защиту декодеру. Проверять границу контейнера и запрещённые хвосты согласно алгоритму приёма.

**RV-scan-pipeline-08 — medium — `apps/recognizer/src/recognize/recognize-scan.ts:190`.** Валидатор возвращает имя нарушенного поля, но обработчик его теряет. Дополнительно `live.ts:107` приводит неизвестный ответ типом вместо проверки структуры: отсутствующие `items`/`candidates` способны вызвать исключение, а `SchemaViolationError` классифицируется как недоступность провайдера. Проверять ответ из `unknown`, сохранять диагностическое поле и различать ошибки схемы и транспорта.

**RV-scan-pipeline-09 — high — `apps/recognizer/src/observability/model-call-log.ts:29`.** START отправляется через обычный logger с `process.stdout.write` (`packages/shared/src/log/logger.ts:33`), без гарантии синхронной записи в pipe перед вызовом. Тест аварийного завершения заменён агрегированием выдуманных строк. Поздний результат также остаётся в журнале `ok`: ветка `recognize-scan.ts:263` не пишет `late`. Реализовать требуемую гарантию записи и испытать настоящий журнал дочернего процесса при аварии и позднем ответе.

**RV-scan-pipeline-10 — high — `tests/unit/source-guards.test.ts:103`.** Страж не проверяет полный запрещённый набор полей JSON-схемы: `kcal`, `protein`, `fat`, `carbs` в `live.ts` его регулярное выражение пропускает, второй тест читает только `types.ts`. Проверок единственного чтения оценки и условия запрета `done` нет. Добавить проверки именно производственной схемы и условия записи, подтвердить каждую мутацией. Зелёные шесть тестов этого доказательства не дают; мутации в данном read-only ревью не выполнялись.

**RV-scan-pipeline-11 — high — `docs/features/scan-pipeline/05_completion.md:5`.** Утверждение «закрывает все 38 AC исполненным тестом» неверно: конкурентная эскалация не вызывает провайдера, HEIC заменён AVIF, многокадрового сценария нет, таймаут и сохранение реальной квоты не проверены. В тесте нормализации пороги взяты из проверяемого `CANON`. Исправить статус покрытия и добавить требуемые сценарии с независимыми литералами; объяснение замены теста не делает её эквивалентной.

**RV-scan-pipeline-12 — medium — `apps/recognizer/src/recognize/recognize-scan.ts:77`.** Аудит устаревшей аренды содержит только старый fence. `recordResult` не возвращает и даже не перечитывает текущий fence. Тест с названием «аудит несёт…» отправляет журнал в пустой sink. Передавать оба fence и проверять поля реального события вместе с оплатой обеих попыток.

**RV-scan-pipeline-13 — medium — `tests/unit/match/composite-parts.test.ts:28`.** Тест создаёт собственные снимки, затем подтверждает, что создал разные снимки; производственный код вообще не вызывается. В `recognize-scan.ts:249` снимки и части теряются. Проверить настоящий обработчик с подставленным составным результатом порта; границу ответственности за сохранение снимков привести в соответствие со спецификацией.

**RV-scan-pipeline-14 — medium — `docs/features/scan-pipeline/01_specification.md:536`.** Сценарий перехода суток требует повторной оплаты задания возрастом 60 секунд, тогда как общий бюджет равен 30 секундам. Буквальное воспроизведение возвращает `failed(timeout)` без оплаты. Тест подменяет его другим сценарием — первым захватом через 15 секунд. Согласовать критерий с бюджетом и проверить день, `reset_at` и оба реальных счётчика.

**RV-scan-pipeline-15 — medium — `apps/api/src/routes/scans.ts:200`.** Проверка первого скана выполняется после COMMIT через `SELECT 1 … LIMIT 1`. Она возвращает одну строку при каждом успешном скане, поэтому `install` пишется каждый раз и искажает ростовые метрики. Определять первый скан корректно, включая конкурентное создание.

**RV-scan-pipeline-16 — medium — `apps/recognizer/src/lease.ts:100`.** `WRITE_RESULT` не обновляет `escalated` и `attempt_no`; при вставке они равны `false` и `1` и такими остаются после второго вызова. GET сообщает ложное отсутствие эскалации. Передать эти поля в результат и проверить сохранённую строку после двух вызовов.

**RV-scan-pipeline-17 — medium — `scripts/telemetry/model-calls.cjs:36`.** Вместо указанной команды с датой реализован другой интерфейс: путь к файлу/поток; поле `day` не используется для отбора суток. Требуемая команда отсутствует, а смешанный журнал даёт агрегат за все дни. Реализовать согласованный интерфейс и проверить CLI на журнале нескольких суток.

## Что проверено без замечаний

- Атомарный SQL квоты использует `ON CONFLICT … WHERE used < limit RETURNING`; отказ внутри публикации приводит к исключению и откату транзакции.
- Загрузка оригинала и вызов модели находятся вне транзакций БД; ограничение частоты зарегистрировано на `onRequest`, до разбора тела.
- В записи результата присутствуют условия по fence и `status='queued'`; конкурентный тест с Deferred действительно перекрывает работу двух обработчиков.
- Проверки отсутствующих потолков API, пустых и некорректных значений конфигурации проходят.
- При реальном `NullMatchIngredientPort` обработчик возвращает `failed(no_food_matched)`; объявленную недостижимость `done` дефектом не считаю.
- Новая логика не пишет дневник; нарушение порядка согласия перед записью в этой фиче не обнаружено.
- В compose у БД и MinIO нет опубликованных портов; порт прокси привязан к `127.0.0.1`. Из `.env*` отслеживается только `.env.example`; секретов в просмотренном коде и дифе не обнаружено.
- Выполненные тесты и локальные воспроизведения не обращались к внешним провайдерам. `git diff --check 5ef217c..HEAD` прошёл. Файлы проекта не изменялись.
