# upload-and-quota — отчёт Codex

Код брифа реализован, локальные проверки проходят. **Фича пока не принята:** обязательные
конкурентные интеграционные проверки не выполнены из-за недоступного Docker/тестового окружения;
независимое ревью Anthropic завершилось сетевым таймаутом. `Status: failed` внизу означает
незакрытые ворота приёмки, а не зелёный результат пропущенных тестов.

## Исходники и границы

- Baseline: `34ff6e7ccaee5872bbdf997673a523ca5b202f3a`.
- Проверенный снимок исходников: `151224998ec8a16eb873f39c2188d4bca3fcd2af04d2f628c6c779ae9fc0990d`.
- Next build: `UN5FZRt-ZgoNr571kX7rC`.
- Хэши 39 изменённых/новых исходных файлов: [`upload-source.json`](../../../tests/artifacts/upload-source.json).
  Хэш снимка — SHA-256 канонического JSON карты `files`, ключи отсортированы, separators `,` и `:`.
- `001_init.sql`, `docker-compose.yml`, `.claude/` и документация канона не изменены.
  Уже существовавшее изменение исторического `docs/telemetry/.../events.jsonl` не тронуто.
- Коммита, применения миграции к живой БД, развёртывания и обращения к платным моделям продукта нет.

## Что реализовано

**Пункт 0 выполнен первым.** Новый `tests/ip-prefix.test.ts` сначала упал на двух разных IPv6,
дававших `2001:d00::/24` (exit 1), затем прошёл после исправления `ipPrefix` на IPv4 /24 и IPv6 /64
(exit 0). Обновлены прежние ожидания IPv6 в auth и описание интеграционного теста PostgreSQL cidr.

**S3.** Наполнены `packages/s3/src/{client,presign,multipart,operations,index}.ts`. Конфигурация
передаётся из `packages/shared/src/config.ts`, собственных чтений `process.env` в адаптере нет.
Все шесть параметров S3 обязательны; `S3_FORCE_PATH_STYLE` принимает строго `true|false`.
Подписи PUT частей и GET ограничены 900 с. Auto-checksum отключён как в доноре, `Content-Length`
не добавляется в подпись. Размер части `max(10 MiB, ceil(fileSize/100))`: снят ограничитель
Codespace 14 MiB. SDK ограничен тремя попытками, connection timeout 2000 мс, request timeout
5000 мс с исключением по таймауту.

Перед серверным Complete выполняются ListParts с пагинацией, проверка ETag, состава частей и
суммы размеров, сообщённых хранилищем. После Complete — обязательный HEAD и Range GET первых
4096 байт. Размеры объектов возвращаются как bigint. Ошибка HEAD без размера не становится нулём.
Abort не подавляет инфраструктурные ошибки; `NoSuchUpload` безопасен при повторной очистке.

**Квота.** `packages/db/src/quota.ts`: транзакционный помощник, шесть scope, пределы из окружения,
московские календарные сутки, причины `upload|upload_refund|minutes|llm`. Списание — INSERT нуля
и отдельный условный UPDATE. Выражение сравнения расширено до bigint против переполнения int.
Для составных причин SAVEPOINT откатывает все их счётчики при отказе, сохраняя внешнюю
транзакцию `video`; возврат права на refund и уменьшение uploads выполняются в транзакции,
записывающей `failed`. Только шесть причин свойств файла допускают возврат.

**Создание.** `apps/web/src/server/video.ts`: Zod до атомарной заявки Idempotency-Key,
`user_uploads` до первого S3-вызова, серверный ключ объекта, сохранённые multipart ID, размер
части и подписанный ответ. Два одинаковых ключа синхронизируются UNIQUE/транзакцией БД.
Повтор до истечения срока получает буквально те же ссылки; после истечения обновляются ссылки
того же upload ID без второго списания. Отказ по квоте сохраняется как failed и повторяется
по тому же ключу без обращения к S3. При ошибке подписания SQL откатывается, multipart abort-ится.

**Завершение.** Владение проверяется по аккаунту сессии; чужой/отсутствующий ID — одинаковый 404.
Строка video блокируется на время перехода. Too-large/not-media записывают failed и refund
атомарно; очистка S3 следует после COMMIT, повтор безопасно завершает её после ошибки S3.
Минуты не списываются, длительность не измеряется. Queued фиксируется перед BullMQ add в `stt`;
job ID — `stt:<video_id>:1`. Если транспорт отказал после COMMIT, повтор complete восстанавливает
постановку. Дубли transport add имеют один job ID. Очереди обработки и воркеры не реализованы.

**API.** Добавлены настоящая tRPC-процедура `video.create` через `/api/trpc/[trpc]` и маршрут
`POST /api/upload/complete`. Общий с auth Redis-лимитер вызывается до чтения тела, включая tRPC.
Проверяются Origin, сессия, размер потока JSON (65536 байт независимо от Content-Length),
валидность UUID/имени/размера/частей. Batching отключён. Ответы содержат request_id и no-store.
В tRPC сохранена стандартная транспортная оболочка `result.data` / `error.data`; прикладные
`data/meta` и `error.data.upload` содержат контрактные значения. Невалидный ввод даёт HTTP 422.

**Браузерный транспорт без экрана.** `apps/web/src/lib/upload-parts.ts` отправляет Blob напрямую
по выданным URL, нарезает по серверному part_size, не добавляет подписываемых заголовков,
явно сообщает о сетевой/CORS ошибке, отказе хранилища, истечении ссылки и невидимом ETag.
Экранов в этой фиче нет; помощник готов для подключения следующими фичами.

**Миграция.** Новый `packages/db/migrations/003_upload.sql` добавляет поля к video:
`upload_parts`, `upload_part_size`, `upload_day`, `upload_enqueued_at`; новых сущностей нет.
Пределы квот не записываются в БД. Миграция 001 сохранена неизменной.

**Зависимости.** Workspace-манифесты и единый lockfile: AWS SDK S3/presigner 3.1137.0,
tRPC server 11.19.0, BullMQ 5.81.5, связи workspace. Новых переменных compose нет;
существующие S3-переменные подключены к web environment/preflight. Тестовая фикстура wiring
обновлена: она копирует новый пакет S3 и испытывает действительно отсутствующую переменную.

## Переиспользование: каждая строка исходников

Все пути источников ниже относительно `.reference/jan-clone/`.

| Источник | Цель | Вердикт и изменения |
|---|---|---|
| `packages/s3/src/client.ts` | `packages/s3/src/client.ts` | **Адаптировано:** перенесены S3Client, SigV4/checksum настройки; env вынесен в shared, singleton принадлежит web runtime, endpoint без дефолта, forcePathStyle из конфигурации, ограничены таймауты. |
| `packages/s3/src/presign.ts` | `packages/s3/src/presign.ts` | **Адаптировано:** перенос подписания через getSignedUrl; 3600 → жёсткие 900 с, PUT только multipart parts, GET сохранён, фиксированная signingDate для одинакового ответа. |
| `packages/s3/src/multipart.ts` | `packages/s3/src/multipart.ts` | **Адаптировано:** перенос create/complete/abort и расчёта части; снята прокси-граница 14 MiB, добавлены ListParts/сумма/ETag/пагинация, серверное завершение, ошибки abort не подавляются. |
| `packages/s3/src/operations.ts` | `packages/s3/src/operations.ts` | **Адаптировано:** перенесены HEAD, Range GET, delete; bigint, отсутствие размера — ошибка, повторные попытки доверены SDK. Неиспользуемые put/stream сейчас не переносились. |
| `apps/web/app/api/upload/route.ts` | отсутствует | **Не применимо:** прокси загрузки через Next прямо запрещён брифом; браузерный помощник отправляет байты непосредственно в S3. |

## Переиспользование: каждая запись граблей

| Прочитанный источник | Вердикт и влияние |
|---|---|
| `myinsights/INS-004-s3-cors-upload-hang.md` | **Адаптировано:** ниже чек-лист CORS бакета; browser helper отвергает Promise с понятной ошибкой при network/CORS, отсутствие доступного ETag тоже явно ошибочно. Прокси-обход из донора не переносится. |
| `myinsights/INS-007-s3-signature-mismatch.md` | **Адаптировано:** WHEN_REQUIRED checksum, неизменный URL, без добавленного ContentLength/headers после подписи; unit проверяет SignedHeaders=host. |
| `myinsights/INS-009-nextjs-body-size-limit.md` | **Адаптировано:** байты файла не проходят Next; HEAD после Complete обязателен; добавлен реальный интеграционный сценарий 11 MiB/две части (ещё не исполнен). Настройка увеличения Next body limit не нужна. |
| `myinsights/INS-024-upload-slow-codespace.md` | **Адаптировано:** part_size зависит от fileSize, убран потолок 14 MiB, нет двойного прохождения файла через web. Скорость реального браузера не измерена. |

## Команды и результаты

| Команда / проверка | Exit / результат |
|---|---|
| `npm test -- tests/ip-prefix.test.ts` до исправления | **1**, 1 failed: разные IPv6 получили один /24. |
| Та же команда после исправления | **0**, 1 passed. |
| `bash ../../scripts/complexity-router.sh apps/web/src/server/video.ts packages/db/src/quota.ts packages/s3/src/client.ts packages/db/migrations/003_upload.sql` | **1**, mechanical L; substantive **XL** из брифа, деньги. Это не ошибка тестов. |
| `npm install --workspace=packages/s3 @aws-sdk/client-s3 @aws-sdk/s3-request-presigner @clipmaker/shared@0.1.0 --cache /tmp/n5-npm-cache --fetch-retries=0 --fetch-timeout=15000` | **0**. |
| `npm install --workspace=apps/web @trpc/server@11 bullmq@5 @clipmaker/s3@0.1.0 --cache /tmp/n5-npm-cache --fetch-retries=0 --fetch-timeout=15000` | **0**, npm сообщил 2 vulnerabilities; подробности не получены, см. ограничения. |
| `npm install --workspace=packages/db @clipmaker/shared@0.1.0 --cache /tmp/n5-npm-cache --fetch-retries=0 --fetch-timeout=15000` | **0**. |
| Первый typecheck новых SDK тестов | **2**: перегрузка SDK send ошибочно выводила Promise<void> у mock; исправлена типизированная тестовая граница. |
| Первый полный `npm test` | **1**, 100 passed / 1 failed / 23 skipped: старая wiring-фикстура не копировала пакет S3. Исправлено. |
| Проверка исправлений: `npm test -- tests/upload-route.test.ts tests/upload.test.ts tests/wiring.test.ts tests/s3.test.ts` | **0**, 22 passed. |
| **Финальный `npm test`** | **0**, **107 passed / 25 skipped**, 16 passed test files / 2 skipped. 17 новых и 8 прежних интеграционных тестов НЕ исполнены. 14,61 с. |
| **`npm run lint`** | **0**. |
| **`npm run typecheck`** | **0**, все workspace и tests. |
| **`npm run build`** | **0**, все пять workspace; Next вывел оба новых маршрута. |
| `node scripts/test-upload-mutations.mjs` | Первый запуск **1** из-за sandbox EPERM на spawnSync pipes; после перевода вывода в файловый дескриптор **0**, все 3 мутации обнаружены. |
| `node ../../.claude/hooks/check-ports.cjs .` | Без env **2**; с временным случайным тестовым env **0**. Дополнительно `COMPOSE_PROFILES=test,edge`: **0**, распознаны 3 хранилища и proxy. |
| `bash ../../scripts/check-port-conflicts.sh .` | **0** при тестовом env. Docker ps недоступен, поэтому это не полное подтверждение занятости портов живых контейнеров. Начальный вызов с неверным относительным путём дал **2**, путь исправлен. |
| `bash scripts/check-env-wiring.sh` | Без env **2**; с временным тестовым env **0**, потерь нет. Проверяет конфигурационный граф, не боевые секреты. |
| `git diff --check` | **0**. |
| `docker ps --format '{{.Names}}'` | **1**, permission denied на `/var/run/docker.sock`; контейнеры не запускались. |
| `npm audit --json --cache /tmp/n5-npm-cache` | Ошибка `EAI_AGAIN registry.npmjs.org`, audit не выполнен; отдельный exit audit не сохранён, обёртка завершилась 0. |
| `timeout 240 claude -p --model opus --tools Read,Grep,Glob --restricted --strict-mcp-config --no-session-persistence --output-format json --permission-mode dontAsk --max-turns 12` | **1**, `Request timed out`; duration_ms=189773, duration_api_ms=0, modelUsage пуст. Промпт подавался через stdin, файлы не менялись. |

Статические квитанции: [`upload-static-checks.json`](../../../tests/artifacts/upload-static-checks.json).
Секреты для проверки compose были случайными, использовались только для раскрытия конфигурации;
они не записаны в квитанции и не означают подключения к существующим сервисам.

## Мутации — обе строки каждой проверки

Runner испытывает **изолированные копии реальных исходников**, рабочие файлы не портит.
Квитанция с выводом каждого Vitest: [`upload-mutations.json`](../../../tests/artifacts/upload-mutations.json).

| Страж | Чистая реализация | Внедрённый дефект |
|---|---|---|
| `quota SQL uses two statements` | exit **0**, passed | Однооператорный INSERT…ON CONFLICT DO UPDATE…WHERE → exit **1**, failed. |
| `upload quota precedes initiation` | exit **0**, passed | Блок списания перенесён после initiateMultipartUpload → exit **1**, failed. |
| `refund only for file properties` | exit **0**, passed | В whitelist добавлен `refused_user_minutes` → exit **1**, failed. |

Это доказательство способности **исходниковых** стражей обнаружить мутации. Реальный тест V2-R01
на PostgreSQL написан вместе с контрольным старым UPSERT, но пока skipped. Его красный/зелёный
прогон на сервере SQL не подменяется этими строками.

## Приёмочные сценарии и непроверенное

`tests/upload.integration.test.ts` содержит четыре обязательных конкурентных сценария брифа:
N create одного аккаунта, два одинаковых ключа, два property-refund с одним оставшимся правом,
разные аккаунты. Дополнительно: первый n>limit, составные квоты/rollback, user_llm, московская
полночь, сохранённый отказ по ключу, PUT/Complete/HEAD/Range, чужой ID, очередь после COMMIT,
возобновление после отказа Redis, rollback при ошибке подписи, oversized HEAD и multipart 11 MiB.

Все **17 новых** интеграционных сценариев пока **unknown/skipped**, не pass. В HEAD oversized
сценарии только размер подменяется на 2 000 000 001; сам объект небольшой, complete/delete реальные.
Сумма >2 ГБ проверена unit через ответ SDK, физический объект 2 ГБ не загружался.

После восстановления доступа к профилю test необходимы портовые проверки и:

```bash
docker compose --project-directory . --profile test run --build --rm test
```

Нужны реальные env проекта. В текущей сессии эта команда не запускалась после установленного
отсутствия доступа к Docker. Redis/BullMQ add, конкурентность PostgreSQL, применение миграции 003
и сетевое поведение MinIO здесь не подтверждены. Проверка enqueue-after-commit написана с
подменённой функцией очереди. Browser transport unit проверяет запросы, а не реальный браузер.

**Ревью.** Anthropic OWN-002 не закрыто: API timeout, успешной модели нет.
Дополнительный read-only агент `upload_review`, requested `gpt-6-astra/high`, нашёл одну P2:
Zod в tRPC давал HTTP 400 до сервисного обработчика. Исправлено middleware перед input, HTTP-тест
подтвердил 422/invalid и отсутствие вызова service.create. Агент отдельным коротким проходом
подтвердил закрытие по чтению. Других конкретных находок в ограниченном scope не было;
это не замена Anthropic и не проверка интеграций. Изменения рабочих файлов агенту не поручались.

**Расхождения с документами и принятые узкие решения:**

- В брифе «ровно 2 создают запись» и Pseudocode CreateVideo/4 различаются: реализованы ровно
  2 uploading со списанием; отказавшие запросы сохраняют failed-строки для идемпотентного отказа.
- Истёкшие ссылки перевыдаём на тот же upload_id; пока действуют — сохраняем одинаковый ответ.
  Повторно выданы все подписанные номера, включая уже загруженные; список недостающих частей
  для UI возобновления в этой фиче не реализован.
- Для транзакционного восстановления запись failed+refund фиксируется **до** abort/delete S3;
  повтор complete для property-failed повторяет только очистку, не возвращает слот второй раз.
  Это уточнение порядка внешней очистки относительно упрощённого псевдокода.
- Право refund тратится в текущие московские сутки, uploads уменьшается за сохранённый
  upload_day исходной загрузки: старый файл не уменьшает чужой счётчик нового дня.
- При необратимом отказе S3 Complete используется существующее `failed(stalled)` без refund:
  отдельного `upload_failed` в каноне нет. Потерянный ответ Complete восстанавливается через HEAD.
- Queued без `upload_enqueued_at` разрешено повторить для доставки в Redis; остальные законченные
  загрузки отвечают conflict. Автоматический сторож/воркеры остаются фиче queue-and-probe.
- Стандартная оболочка tRPC сохранена; прикладные коды размещены в `error.data.upload`.
- Некоторые старые тексты Architecture/CLAUDE по-прежнему говорят о /24 без разделения IP-семейств;
  код следует обновлённому канону DEC-A-019, документы вне отчёта не редактировались.

**Чек-лист развёртывания S3 (пока не выполнен):** приватный бакет, выключенное versioning;
CORS разрешает точный публичный origin, PUT/GET/HEAD и нужные браузеру заголовки, открывает ETag;
endpoint из подписанного URL доступен браузеру, host/path не переписывает прокси; lifecycle
AbortIncompleteMultipartUpload через 1 день, страховочный expiry 7 дней только `clips/free/`.
Проверить OPTIONS/preflight, реальный прямой multipart/HEAD/Range/delete/abort на Cloud.ru.
MinIO не доказывает совместимость Cloud.ru.

Не выполнены также браузерный E2E/CJM, замеры скорости/расхода S3 и полный security audit
зависимостей. Сообщение npm о двух vulnerabilities осталось без доступной детализации из-за DNS;
security-gate не объявляется пройденным. ffprobe, длительность, воркеры, транскрипция, выбор,
рендер, метка и экраны явно вне scope брифа.

## Телеметрия и передача

Профиль **compact-quality-first-v2**, substantive **XL**. Прямое поручение владельца выполнить
бриф целиком — разрешение реализации заданного плана; повторное согласование не запрашивалось.
Один писатель — текущий Codex; независимые reviewers только читают.

Телеметрия начата в этом файле до пункта 0 и дополнялась на стадиях. Это сознательное размещение
вместо нового `docs/telemetry/...`: более конкретный бриф запрещает любые docs кроме своего
отчёта. JSON run/events отдельно не создавались. `project-work-companion` использован для scope,
source identity и передачи; формального JSON work-record/валидации delivered нет. Readiness
интеграций **blocked**, E2E preflight **not_applicable** — реальный E2E не запускался.
Прогноз — insufficient_data: сопоставимого baseline выполнения этой фичи нет.

| Стадия | Наблюдение |
|---|---|
| Подготовка | Корневой/проектный CLAUDE, локальные правила/навыки, бриф, канон, алгоритмы, FR/SC/ADR, reuse-map и четыре donor insight прочитаны. Время чтения до первой записи не измерено. |
| ROUTE/PLAN/VALIDATE | Mechanical L, substantive XL; план/числа/AC из предоставленного брифа, неоднозначности разрешены выше. Повторный substantive ROUTE перед продолжением реализации сохранён. |
| IMPLEMENT-0, 09:19:34–09:19:47 UTC | Начало записи, красный IPv6 09:19:35, зелёный 09:19:47. |
| IMPLEMENT/QE | Сначала код, затем 17 unit passed в 09:29:38; далее интеграционные сценарии и HTTP/browser tests. |
| REVIEW Anthropic | Requested opus; actual null, API timeout, 189773 мс по CLI. |
| REVIEW Astra | Requested gpt-6-astra/high, actual null: хост не выдал аттестацию модели/usage. Одна P2, затем одна узкая проверка исправления. |
| Коррекции | SDK mock type, wiring fixture, tRPC 422, файловый вывод mutation runner после EPERM. Неудачи сохранены выше. |
| Финальная проверка | npm test начался 09:40:53 UTC, 107 passed/25 skipped; lint/typecheck/build exit 0. |

Текущий исполнитель обозначен хостом как Codex семейства GPT-6; точный actual model ID/effort
и токены текущей сессии недоступны. CLI Anthropic вернул нулевые usage/cost только для своей
неуспешной попытки с `duration_api_ms=0`; это **не** измерение общего расхода работы.
Общие input/cached/output/reasoning tokens = **null**, cost = **null**, cost_basis=unavailable;
active_wall_ms, agent_work_ms = null, интервалы ожиданий отдельно не измерены.
Экономия пока не установлена. Follow-up наблюдение за регрессиями не проводилось.

Измеренная длительность от первой записи до отчёта приведена ниже; полная длительность больше
на неизмеренное начальное чтение. Длительность отражает также инструменты, исправления и
ожидание Anthropic, без выдуманного вычитания параллельных стадий.

Конец записи: 2026-09-22T09:46:54+00:00; elapsed от начала учёта: **1640 с**
(нижняя граница полной длительности). Приёмка заблокирована указанными выше проверками.

Status: failed
