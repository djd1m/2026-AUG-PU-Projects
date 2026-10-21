# F06 — PDF-источник: ограниченный план

RUN_ID: 20261002T190728Z-pdf-source. База подготовки: 9a51f8d5; сверена и fast-forward до принятой F05 ee515a68. Реализация начнётся после отдельного dependency-коммита integration owner. Политика compact-quality-first-v2: отдельный Sol6.1 high (≤25 минут на попытку), отдельный Astra medium review (≤8 минут), затем интеграция координатором. Полный MVP разрешён владельцем; новой остановки на разрешение для M нет.

## ROUTE и основания

Механический ROUTE M/exit0: evidence/route-plan.txt. Содержательный L по границе web→worker, пониженный до M по явной оговорке о SPARC моложе недели: Specification FR-n6b-3/SC-US-003-1…3, Pseudocode Create source/Extract PDF/Worker lease loop, Architecture ADR-012 (30.09.2026). Обязательные проверки M сохраняются: страж с осмысленным red/green, конкурентный cap, полный typecheck/unit/integration/build и runtime UI.

## Минимальное решение

1. Сохранить опубликованный API `POST /api/bots/{id}/sources`: JSON `{url}` остаётся сайтом, `multipart/form-data` с одним полем `file` — PDF. Отдельный `/pdf` из ожидаемых файлов roadmap необязателен; API-таблица Pseudocode является контрактом. Origin, сессия и доступность бота проверяются до чтения большого тела. Тело читается потоком с численным пределом до parse formData; небольшой отдельно названный запас multipart overhead не разрешает PDF >10 MiB. Размер файла >10485760 →413; сигнатура первых5байт `%PDF-` отсутствует →415; неверный multipart →422. До отказа source/file/job не создаются. Не читать upload под транзакцией.
2. После чтения, в withTenant атомарно заблокировать строку видимого бота (FOR NO KEY UPDATE), проверить план владельца и количество PDF; на Free максимум3, четвёртый→409. Конкурентные запросы сериализуются на том же боте, чужой бот→404. В одной транзакции source(kind=pdf,file_name), source_file(bytes,sha256), queued index_job. Возврат202 с job_id ДО обработки. Никакой новой таблицы, миграции, роли, object storage или внешнего сервиса.
3. Worker PDF extractor читает source_file только по source/account задачи, открывает локальный pdfjs-dist из Uint8Array (не URL), проверяет ≤300 страниц до записей. Получает getTextContent постранично, разделяет текстовые элементы, пропускает пустые страницы. Каждый document сохраняет locator_page (1-based), title=file_name, content hash; upsert сохраняет document id. Запись source_file.pages/document защищена running/fence и блокировкой строки задачи, как crawl-store; проверки сигнала/потолка до/после каждой страницы. Нельзя ослабить старые fences ради повторного использования.
4. Полностью пустой документ →failed с точной причиной «в PDF нет текста (скан) — распознавание вне MVP»; >300 страниц и повреждённый PDF — понятная безопасная причина, без сырого сообщения парсера. Эти исходы должны сохраниться через runOnce и быть видны в job API. Lease/cancel/ceiling продолжают распространяться. Ресурсы pdfjs освобождаются в finally. Далее существующий chunk/embed с fake в тестах; повтор сохраняет документы/кэш и не вызывает повторно embeddings для неизменённого текста.
5. Cabinet: форма выбора PDF (label, accept, pending/error/status), POST multipart,202 обновляет список/прогресс; блокировка новой загрузки на время живой задачи. Имена отображаются текстом. Существующий список уже использует file_name; интерфейс цитат следующих фич получает locator_page, генерация ответов здесь не добавляется.

## AC → обязательные проверки

| AC | Результат | Проверка |
|---|---|---|
| PDF-01 | 4MiB PDF →202/job_id, atomic source/file/job queued | реальная БД/API, ошибка вставки job откатывает всё |
| PDF-02 | >10MiB→413, неверная сигнатура→415, недопустимый multipart→422 без записей | поток без Content-Length, превышение declared size, тест отмены чтения на пределе |
| PDF-03 | Free≤3; конкурентно при2существующих ровно один изNзапросов принят, остальные409 | конкурентный DB test + контроль чужого account/bot404 |
| PDF-04 | локальный двухстраничный PDF→два document c locator_page1/2 и chunks;≤300 | настоящий pdfjs fixture,301страниц failed до документов |
| PDF-05 | scanned/empty→точная причина через worker→DB→jobAPI; invalidPDF безопасный отказ | интеграционные тесты реального runOnce |
| PDF-06 | stale/closed worker не пишет; сигнал/ceiling останавливает; retry/cache сохраняются | concurrent/fence tests, meaningful expected-red cap or fence, restoredgreen |
| PDF-07 | форма PDF доступна,202/ошибки/прогресс видны,390/1440 безoverflow/JSerror | реальные Docker Playwright проверки переданных файлов на свежем webbuild |
| PDF-08 | typecheck+всеunit+всеintegration+build, независимый review,cleanup | sourcebound immutable image; один полный успешный прогон после финального кода |

## Владение, границы и зависимости

Coordinator/root владеет dependency-манифестами и lockfile. Новый local runtime package `pdfjs-dist` точной версии6.3.289 подтверждён official npm registry 02.10.2026; engines>=22.13.0 соответствует Docker22.22. Точное решение фиксирует root dependency-коммит. Официальный Node пример: https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs ; руководство: https://mozilla.github.io/pdf.js/examples/ . Только локальные bytes, без pdf URL fetch.

Sol владеет новыми `packages/db/src/pdf-sources.ts`, export в index.ts; `apps/web/src/server/pdf-handler.ts`, минимальным dispatch существующего sources route, `cabinet/add-pdf.tsx` и подключением в page.tsx; `services/worker/src/pdf/*`, main wiring; относящимися tests/fixtures и документом05_completion. Допускается минимальный общий helper при доказанной необходимости, без самостоятельного рефакторинга смежных модулей. Manifests/lock/migrations/compose/config/roadmap не править. Никаких N6 donor reads. Внешние доноры не нужны: используются уже принятые N6b tenant/job/fence/embed интерфейсы; N5S3 отвергнут по ADR012.

Границы попытки: ≤25минут включая чтение/код/проверки/cleanup; не тратить время на повторные попытки Docker в sandbox. Если socket недоступен, автор делает код/тесты и handoff, coordinator выполняет обязательный Node22прогон. Никаких childagents; один писатель; не запускать следующее улучшение сверхAC. Raw prompts внеgit, secrets только private/tmp, не выводить. Docker отдельный compose n6b-f06-pdf, максимум2CPU, DBбезports, portcheck доstartup, cleanup всегда. Runtime UI отдельным sourceboundpreflight. Предыдущий UI F05 не засчитывается за PDF.

Прогноз сроков/стоимости не даётся: insufficient_data, несопоставимый предыдущий crawl с несколькими исправлениями. Указанные25/8минут — лимиты попыток, не обещание срока. Actual native coordinator/usage неизвестны; CLI model/usage будет сверяться по rollout. Сэкономленные проценты не заявляются.
