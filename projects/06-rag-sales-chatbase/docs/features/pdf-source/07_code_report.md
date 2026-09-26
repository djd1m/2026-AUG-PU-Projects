# pdf-source — отчёт о коде

**Фича:** 5 `pdf-source` · **Дата:** 2026-09-26 · **Исполнитель:** Opus 5.5 (агент, автономный режим;
фактическая модель — метаданные сессии `claude-opus-5-5[1m]`) · **FR:** `FR-SOURCE-003` · **SC:** `SC-US-004-2`,
`SC-US-004-3` (и `SC-US-004-1` в части «PDF → страницы с подписью `файл.pdf#с. N`») · **ADR:** ADR-016, ADR-018 ·
Квитанция — [`05_completion.md`](05_completion.md), решения — A-N6-027. OpenAI/Codex не вызывался.

## Что сделано

| Файл | Что | Алгоритм / требование |
|---|---|---|
| `apps/web/src/app/api/bots/[botId]/sources/route.ts` | маршрут `POST`, зависимости из `getRuntime()` | CreateSource |
| `apps/web/src/server/source-upload-handler.ts` | порядок: лимит частоты → `Origin` (обязателен) → сессия и владение ботом (чужое = 404) → `Idempotency-Key` UUID → повтор по ключу = тот же 202 без чтения тела → вид тела (JSON → 422, не multipart → 415) → `Content-Length` обязателен и ≤ 10 МБ + 64 КиБ (иначе 413 ДО тела) → предел плана (403 ДО тела) → чтение потока с обрывом (больше заявленного или потолка → 413; меньше → 400) → одна часть `file` → 0 байт 400, > 10 МБ 413, не `%PDF-` 415 → файл `wx`/`0600` + `fsync` в `uploads/<id>` → строка задачи (атомарный предел) → очередь после коммита (сбой → всё равно 202, сторож доставит) → `202 { index_job_id }`; всё, что не стало задачей, удаляется | CreateSource п.1–2, 4–5; SC-US-004-3 |
| `apps/web/src/server/multipart.ts` | ручной разбор multipart с ОДНОЙ частью: граница по RFC 2046, заголовки части в окне 8 КиБ, конец данных — один `indexOf` вперёд, параметры `Content-Disposition` — сканер без регэкспов (WHATWG: `\` не экранирует), `filename*`; `sanitizeFileName` (без пути, управляющих символов и `#`, NFC, ≤ 120 символов с расширением) | граница файла |
| `packages/db/src/pdf-sources.ts` | `readOwnedBotForPdf` (активный бот активного аккаунта, неизвестный план → free, число PDF ≠ failed), `findJobByIdempotencyKey`, `createPdfSource` — в транзакции `FOR UPDATE OF bot`: повтор ключа → та же задача, затем счёт PDF против `PDFS_BY_PLAN`, затем `createSourceJobTx` | CreateSource п.2, 4 |
| `packages/db/src/index-jobs.ts` | `createSourceJobTx` принимает `indexJobId`, выбранный вызывающим (файл пишется под этим именем ДО коммита) | ADR-018 |
| `packages/rag/src/constants.ts`, `config.ts` | `PDF_MAX_BYTES` 10 МБ, `PDF_MAX_PAGES` 100, 20 символов, 90 %, `PDFS_BY_PLAN` 3/10/10, `isPdfMagic`; `N6_UPLOAD_DIR` обязателен (абсолютный нормализованный путь) у web и worker | канон §7 |
| `apps/worker/src/pdf/extract-child.mjs` | дочерний процесс: байты из stdin, `pdfjs-dist/legacy` (`isEvalSupported: false`, без шрифтов системы, без XFA, без нативного canvas — загрузка запрещена хуком `Module._load`), число страниц ДО текста, обрыв по объёму текста, одна строка JSON в stdout; любая непрочитанная страница = документ битый; ошибка вне pdfjs = `pdf_crashed` (internal), а не «не PDF» | ExtractPdf п.1 |
| `apps/worker/src/pdf/extract-pdf.ts` | родитель: `spawn(node --max-old-space-size=256)` с ПУСТЫМ окружением; таймаут 30 с → SIGKILL → `pdf_timeout`; замер `/proc/<pid>/status` VmRSS каждые 25 мс, > 384 МБ → SIGKILL → `pdf_memory`; SIGABRT/134 → `pdf_memory`; stdout ≤ 16 МБ; проверка формы ответа; `assertTextLayer` (≥ 90 % страниц < 20 символов → `no_text_layer`); отображение 14 подробных кодов на закрытый список причин | ExtractPdf п.1–2, A-N6-027 |
| `apps/worker/src/pdf/pdf-processor.ts` | в задаче: источник pdf → файл в томе (`lstat`: есть, обычный, ≤ 10 МБ) → `%PDF-` ещё раз → разбор → сброс счётчиков под фенсом, `pages_total` = числу страниц → по транзакции на страницу (`recordProgressTx` + upsert `page` с `url_or_page = «файл.pdf#с. N»`, `content_hash` = sha256 текста); пустые и дубли — `pages_skipped`; известный хэш — «без изменений»; в журнал только счётчики | RunIndexJob п.2–5 |
| `apps/worker/src/pdf/uploads.ts` | `removeUpload`, `sweepUploads` (UUID-имена старше 10 мин, задача завершена или отсутствует) | ADR-018 |
| `apps/worker/src/run-index-job.ts`, `index.ts` | `onSettled` после `done` И `failed` (не `stale`, не перед автоповтором), ошибка уборки не меняет исход; воркер подключает PDF-обработчик, удаление файла и подметание тома в проходе сторожа | ADR-018 |
| `Dockerfile`, `apps/worker/package.json`, `apps/web/package.json`, `next.config.ts` | `pdfjs-dist@6.3.289` (точная версия) в worker; `@napi-rs/canvas*` удаляются после `npm ci`; сборка копирует `extract-child.mjs` в `dist/pdf`; web зависит от `@n6/queue`, `bullmq` — `serverExternalPackages` | зависимость |
| тесты | `tests/pdf-extract.test.ts` (23), `tests/pdf-boundary.test.ts` (26), `tests/pdf-multipart.test.ts` (43), `tests/pdf-job.integration.test.ts` (13); фикстуры `tests/fixtures/pdf-factory.ts` (PDF 1.4 с верной xref, кириллица через `/Differences /uniXXXX`), `tests/fixtures/pdf-child-fakes.mjs` | Refinement |
| `scripts/test-pdf-mutations.mjs` | 7 мутаций | guard-must-be-able-to-fail |

## Выбор зависимости (обоснование)

`pdfjs-dist` 6.3.289 (Apache-2.0) против poppler `pdftotext`: poppler — GPL-2 (постановка требует MIT/Apache) и
C-код с длинной историей ошибок памяти на враждебных PDF; pdfjs — чистый JS (ошибка разбора — исключение, а не
повреждение памяти), назван в Architecture «Parsing» и coding-style. `npm audit --omit=dev`: pdfjs добавил 0
уязвимостей (до и после: те же 2 — `next` → `postcss`, high + moderate, были до фичи). Размер: `pdfjs-dist` 34,9 МБ
в `node_modules`; необязательный `@napi-rs/canvas` (~34 МБ нативного кода) удалён из образа и запрещён в
дочернем процессе.

## Замеры, определившие пределы (прототип до кода, `node --max-old-space-size=256`)

| Вход | Размер файла | Итог без пределов родителя |
|---|---|---|
| flate-бомба (400 МБ пробелов) | 408 КБ | **915 МБ RSS**, 4,4 с, «успех» с пустым текстом — куча V8 не видит буферы распаковки → нужен замер RSS |
| экспоненциальный разворот форм (2^40) | 7 КБ | **не завершился за 60 с** → нужен таймаут |
| 500 000 вложенных `[` | 1 МБ | переполнение стека, 0,3 с |
| цепочка 20 000 форм | 3,4 МБ | 0,5 с, шум «Exception in PromiseRejectCallback» в stderr |
| 200 000 объектов | 10 МБ | 0,4 с |
| 8 млн символов в одном `Tj`-потоке | 9 МБ | pdfjs отдал 92 символа — фикстура «лишний текст» переделана на 100 стр. × 500 строк |

## Проверки (дословно)

| Проверка | Команда | Итог |
|---|---|---|
| typecheck | `npm run typecheck` | 0 |
| lint | `npm run lint` | `Статические правила: ошибок нет` |
| build | `npm run build` | 0; маршрут `ƒ /api/bots/[botId]/sources`; `apps/worker/dist/pdf/extract-child.mjs` на месте, `extractPdf` из `dist` разобрал нормальный PDF («Прайс-лист компании "Ромашка"…») |
| локально (без БД/Redis) | `npx vitest run` | `Test Files  18 passed \| 7 skipped (25)`, `Tests  513 passed \| 56 skipped (569)` |
| **прогон в образе** на Postgres 16 + pgvector 0.8.6 и Redis 7.4 | `docker compose -f compose.test.yml --project-directory . --env-file /tmp/n6-foundation.env run --rm --build test` | **`Test Files  25 passed (25)` / `Tests  569 passed (569)`**, код 0, пропусков 0; PDF-наборы: extract 23 (19,4 с), job.integration 13, boundary 26, multipart 43 — `tests/artifacts/pdf-source/compose-test-run.txt` |
| мутации в образе | `… run --rm --build test sh -c 'node scripts/test-db.mjs && node scripts/test-pdf-mutations.mjs; node scripts/test-index-job-mutations.mjs; node scripts/test-crawler-mutations.mjs'` | PDF: код 0, **7/7**; задача: код 0, 6/6; краулер: код 0, 9/9 — `tests/artifacts/pdf-source/mutations-run.txt` |
| проброс переменных | `N6_ENV_FILE=/tmp/n6-foundation.env bash scripts/check-env-wiring.sh` | 0 — `Потерь нет` (`N6_UPLOAD_DIR` уже был в `x-model-env` compose для web и worker-index) |
| контракт долгой задачи | `node ../../.claude/hooks/check-job-contract.cjs .` | **2** — `not-deployed` (законно до стенда) |
| образ | `ls node_modules/@napi-rs` в образе `test` | `canvas*` нет |
| остановка стека | `… down -v` | контейнеров `n6-test` — 0; сиротских процессов разбора на хосте — 0 |

## Мутации (guard-must-be-able-to-fail), набор PDF — 105 тестов

| Мутация | Дефект возвращён | Код восстановлен |
|---|---|---|
| `child-timeout-removed` — у дочернего процесса нет таймаута | 2 failed \| 103 passed (105), код 1 | 105 passed (105), код 0 |
| `magic-check-removed` — тип не проверяется по `%PDF-` на границе | 3 failed \| 102 passed (105), код 1 | 105 passed (105), код 0 |
| `scan-accepted` — скан без текста принят как успех | 6 failed \| 99 passed (105), код 1 | 105 passed (105), код 0 |
| `memory-limit-removed` — RSS дочернего процесса не ограничен | 2 failed \| 103 passed (105), код 1 | 105 passed (105), код 0 |
| `pdf-deleted-only-on-success` — файл удаляется только после done (Refinement «Стражи») | 5 failed \| 100 passed (105), код 1 | 105 passed (105), код 0 |
| `size-declared-only` — размер только по `Content-Length` | 1 failed \| 104 passed (105), код 1 | 105 passed (105), код 0 |
| `plan-limit-unlocked` — счёт PDF без `FOR UPDATE` строки бота | 1 failed \| 104 passed (105), код 1 | 105 passed (105), код 0 |

Скрипт после каждого прогона убивает оставшиеся дочерние процессы разбора своего временного каталога (`pkill -f`):
при мутации «без таймаута» тест краснеет по таймауту vitest, а процесс разбора остался бы сиротой.

## Итог

Обязательные проверки постановки выполнены и зелёные; `check-job-contract.cjs` → 2 (not-deployed, законно до
стенда). Коммита нет (по постановке).

Status: completed
