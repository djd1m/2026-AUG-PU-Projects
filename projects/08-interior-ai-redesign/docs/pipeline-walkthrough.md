# Как устроен RoomKind: от фотографии до сравнения

История F01 на 2026-10-02: F01 (авторизация и приватные загрузки) собран и проверен в изолированном Docker с PostgreSQL16: 12 unit и 8 integration passed, npm audit — 0 уязвимостей. F01 принят после двух исправлений очистки/mutation harness и отдельного исправления Compose, каждое проверено независимой Astra; новая realPG suite —9tests, unit/harness —14. Локальный host HTTP и фактическая изоляция DB проверены. Текущие программные приёмки F02 и F03a приведены ниже; реальная GPU-геометрия и итоговый app E2E ещё не пройдены. Формат заимствован из walkthrough N5/N6 по прямой просьбе владельца; их runtime факты сюда не переносятся.

## Кто выполняет работу
Web принимает фото, хранит аккаунт/платежи и показывает результат. PostgreSQL хранит очередь и ledger кредитов. Отдельный Python GPU-worker строит depth-карту и запускает Stable Diffusion + ControlNet. Ни OpenAI image generation, ни внешний API генерации не заменяют эту цепочку. Реальная доступность CUDA на текущем host не подтверждена.

## 1. Фото
Пользователь входит и загружает JPEG/PNG/WebP. Web проверяет magic bytes,≤10MB/20MP, декодирует и удаляет EXIF. Файл получает случайный UUID в приватном томе; чужой аккаунт не может прочитать его URL. Точные пределы байтов/пикселей, EXIF/orientation и изоляция двух аккаунтов реально проверены тестами F01 на ревизии `29b070be`; итоговая приёмка F01 закрыта на `187a14a5`, см. `features/f01/acceptance.md`.

## 2. Стиль и задача
Выбранный стиль задаётся enum, не произвольным серверным prompt. POST возвращает job_id до inference. В одной транзакции резервируются кредит, задача и первая попытка в суточном бюджете. Бюджет считает выделенные попытки консервативно: отмена не возвращает его ёмкость. Повтор с тем же ключом возвращает ту же работу. Обрыв сети означает неизвестное состояние, которое UI уточняет GET-запросом.

## 3. Очередь и GPU
Worker берёт lease в postgres, увеличивает fence, посылает heartbeat. Depth extractor создаёт карту из исходного изображения, ControlNet использует её при img2img. Пишутся model revision/seed/input hash/config/duration. Запоздавший worker не может опубликовать результат после смены fence. Очередь истекает через60с, попытка длится не более180с, всё задание —360с с момента приёма. Повтор требует новую квоту; её отсутствие переводит работу в отказ и возвращает кредит ровно раз.

## 4. Геометрия
Файл изображения ещё не доказывает качество. Корпус12×3 проверяет окна, двери и стыки стен, сдвиг≤2% диагонали; новое/пропавшее окно запрещено. Реальные результаты пока отсутствуют. UI fixture обязан писать, что это демонстрация; fixture не входит в GPU benchmark. Публичные примеры дополнительно проходят операторскую проверку, привязанную к хешам результата, происхождения и отчёта корпуса; актор и время сохраняются.

## 5. Сравнение, галерея, share
Владелец двигает slider между исходным фото и результатом; личная галерея приватна. Share CTA рядом с результатом создаёт композит; бесплатный экспорт содержит RoomKind badge, AI label остаётся всегда. Публичная галерея требует отдельный opt-in и полезное описание, revoke отзывает доступ. Export delivery не выдаётся за доказанный пост в соцсети.

## 6. Пакет генераций
Web создаёт ROOM20:20/900RUB на сервере. YooKassa hosted checkout выносит карточные данные к провайдеру. Webhook проверяется повторным API чтением оплаты, затем уникальная ledger запись выдаёт20 кредитов. Return URL ничего не начисляет. Подтверждённый возврат блокирует расходы и экспорт без badge; поздний success эту блокировку не снимает. Первая оплата атомарно фиксирует единственную партнёрскую конверсию; повторные покупки её не удваивают. В локальном тесте provider fixture явно обозначен; реальные списания не разрешены.

## Что уже измерено
Одна страница InteriorAI открыта Chromium1440×1000 без входа; body16px и публичная форма зафиксированы. Host probe: NVIDIA device/runtime не обнаружены. Остальные проверки перечислены в telemetry и validation report по мере исполнения; этот список не заменяет будущий app E2E.

### F02a принят; F02b продолжен

После первого Sol прохода независимый Astra нашёл изоляцию тестовых budgets и две внутренние boundary ошибки. Реальный PG подтвердил первую находку; все исходные неудачи сохранены. Один Sol correction исправил3файла и добавил no-reserve case. Финальный sourcec465ee73:20unit/9F01PG/21F02PG,3guardmutations,build/startup/maintenance PASS; fresh Astra ACCEPT. F02b начинает controller/SDControlNet/quality по docs/plans/f02b-inference-quality.md. F02 и MVP ещё не объявлены завершёнными; реальная GPU-геометрия unknown.

### F02b software acceptance → F03

ПервыйqualityPGостановилсянаPNGfixtureвWebPupload; независимыйAstraтакженашёлнеполныйdistinctcorpuscoverageиlate-exitгонкуengine. Solисправил6файлов;40hostunit,13generationвихчисле,27containerunit,PG9/21/7,4mutationsиstartupPASS. FreshAstraACCEPTsource575d822a. Всеошибки/неизвестныеclock/modelполяиimmutableлогиосталисьвистории. F02softwaredone, f05actualCUDA/modelsecurity/realcorpus/performanceblocked. /next→f03-payments,/go→/featureAUTO,substantiveXL,existingownerautonomy,zeroexternalspend. Планdocs/plans/f03-payments.md.

### F03a принят → F03b

Платёжный backend принят на `e50e6368`: серверная цена, асинхронное создание, authenticated verification, однократные начисления и постоянный hold проверены. Первый PG выявил ошибку очереди в тесте; Astra добавил замечание о проверке первой отмены после успеха. Оба сценария исправлены Sol и независимо приняты Astra. Итоговый платежный PG — 17/17 TAP, остальные обязательные build/HTTP/PG/mutation проверки пройдены. Все исходные провалы сохранены в `features/f03a/runtime-initial`.

F03b продолжает утверждённый план: операторские партнёрские коды, отдельное согласие на tracking-cookie, ручной код без cookie и агрегаты первых конверсий. Реальных платежей, выплат или deployment нет.

### F03 завершён → F04

F03b принят на `480126f7`: 47 unit, обязательные существующие PG/HTTP/mutation проверки и исправленный attribution PG7/7. Astra независимо подтвердил закрытие единственного замечания к helper очереди. Согласие на cookie отдельно от ручного кода; партнёрская статистика не создаёт выплат.

`/next` выбирает `f04-product-ui`; `/go` использует `/feature AUTO` с полным циклом из-за приватных фото, публикаций и проверки платного экспорта. F04 разделён на серверные композиты/публикации и интерфейс с реальным браузерным E2E. GPU gate остаётся отдельным и неподтверждённым.

### F04a принят → F04b

Backend композиций и публикации принят на `2bec973b`:75/75 source hashes,27/27 Docker checks,60 unit и шесть новых PG TAP. Отдельно сохранён инфраструктурный отказ из-за Docker subnet exhaustion; после освобождения только завершённых N7 сетей повтор прошёл. Astra не запросил исправлений.

Следующий отдельный Sol-пакет F04b реализует выбранный CJM A в настоящем приложении и браузерные сценарии. Дополнительно исправляется подтверждённая несовместимость чтения attribution state с отсутствующим Origin у same-origin GET: UI использует authenticated exact-Origin POST, остальные проверки сохраняются. Новый companion preflight будет выполнен непосредственно перед E2E.


### F04b: настоящий браузер и конкретные исправления

Интерфейс выбранного CJM A реализован: приватная загрузка, четыре стиля, очередь, сравнение, галерея, пакет, tracking/manual partner code, экспорт и отдельная публикация. Первая независимая Astra-проверка выявила поздний ответ старой генерации, позднюю ошибку старого аккаунта и две ошибки тестового стенда. Sol исправил их; свежий Astra принял исходный diff. Реальный браузер запускается через существующий общий Playwright, клиент и все секреты остаются в собственном контейнере N8. Собственный Caddy даёт HTTPS без изменения shared proxy; база без host ports.

Каждый E2E имеет новый стенд, source/build hashes, read-only companion preflight, отдельный TRACE и сохранённые исходные ошибки. Попытка1 остановилась на однопроходном payment helper. Исправление63c19811 ждёт именно целевой intent; 10 focused tests и meaningful mutant подтверждены независимо. Попытка2 прервана координатором после ошибочного продолжения shell при отказе валидатора служебной записи; это не принятие продукта. Порядок запуска исправлен: валидатор отдельной командой, следующий шаг только после exit0.

Попытка3 выявила недоступное CDP тело ответа upload; d05b458d сохраняет HTTP201, ждёт новый DOM UUID и сверяет приватные owner metadata, 10 tests/две мутации/свежий Astra. Попытка4 показала, что скрытый блок ещё не означает завершение реального удаления. Коррекция6d04b91e ждёт оригинальный handler Promise и все refresh responses, проверяет DELETE200/owner404; детерминированный barrier test и независимый Astra прошли.

Попытка5 дошла до следующей проверки и выявила уже продуктовую гонку: finally предыдущего входа включает кнопки во время нового logoutPending. Сам запрос входа остаётся заблокирован защитой обработчика, но состояние UI неверно. На source6792c6a9 запущена отдельная узкая коррекция app.js с actual-app regression. Ни один из пяти неполных прогонов не объявлен полной браузерной приёмкой. Сохранённые одноцветные комнаты — синтетические software fixtures, не результаты реального редизайна или доказательство геометрии.

Параллельная независимая подготовка F06a была начата и явно прервана для приоритетного product fix и лимита четырёх исполнителей. Это не отменяет дальнейшие README/41AC/restore документы. Их план — plans/f06-delivery.md. F05 real corpus12×3, безопасные pinned GPU weights и30 warm samples остаются невыполненными внешними gates; полного MVP/deployment пока нет.


### F04: измеренные попытки и source-bound продолжение F06a

| Фактический browser stage | Измеренное время / результат | Следующая конкретная коррекция |
|---|---|---|
| [UI1](telemetry/n8-20261002-1740/n8-ui-e2e-1-receipt.md) |17245мс, exit1 |Target-intent payment readiness, не один проход общей очереди |
| [UI2](telemetry/n8-20261002-1740/n8-ui-e2e-2-receipt.md) |28022мс, exit143 |Отдельная проверка companion exit0 перед browser, исходный sequencing отказ сохранён |
| [UI3](telemetry/n8-20261002-1740/n8-ui-e2e-3-receipt.md) |72618мс, exit1 |HTTP201/new DOM UUID/owner metadata вместо evicted CDP response body |
| [UI4](telemetry/n8-20261002-1740/n8-ui-e2e-4-receipt.md) |149422мс, exit1 |Await реального delete handler Promise и refresh chain перед session invalidation |
| [UI5](telemetry/n8-20261002-1740/n8-ui-e2e-5-receipt.md) |125517мс, exit1 |Продуктовый finally раннего login должен учитывать текущий logoutPending |

На `8030270f023d83c9cdd597c4578517a1b58b4b35` [logout correction](features/ui-logout-fix/verification.md) выполнена одной строкой app plus actual-app regression.48local checks прошли; возврат старого finally обнаружен точной мутацией. Свежий parent Astra ACCEPT подтвердил11independent checks,70source/20evidence hashes; отчёт `/tmp/n8-ui-logout-review/answer.md` привязан к этому source и отдельному launch. Это приёмка конкретной коррекции, не итоговый browser PASS. UI6 запущен координатором с snapshot `19ea9d39d31aab8b2a7ce005b79e091fadce203d1272c0c44bf1396aa228c00a`; terminal source-bound PASS в эту docs-попытку не передан. Неудачи1–5 и их synthetic screenshots остаются неизменными.

F06a возобновлён как `n8-f06-delivery-resume-1`; ранний interruption связан с приоритетной UI5 коррекцией, не с docs failure. [README ru](README/ru.md)/[en](README/en.md), [41 отдельных AC](features/f06a/acceptance-map.md) и [operations](features/f06a/operations.md) сверены с существующими исходниками. Restore использует стандартные PG16 tools только в собственном quiescent fixture после browser, без raw dump в Git; здесь он лишь описан, фактический receipt pending. Новые product/PG/build/browser проверки документационный исполнитель не запускал, прошлые counts сохранены как исторические наблюдения. Полный F06/MVP остаётся blocked реальным F05; deployment/spend/live provider не разрешены.

## F04 closure and independent F06a delivery reconciliation

Product8030270f received fresh Astra logout-control ACCEPT. Actual UI6 then passed42 main checks1440/390 in321280ms, plus actual disabled-provider restart2/2 in2832ms; [receipt](telemetry/n8-20261002-1740/n8-ui-e2e-6-receipt.md). Sharedbrowser released03:23:24Z; no fakegeometry/publicposting/livepayment claim. OwnPG backup/restore passed21tables/451rows in16145ms with constraints/source unchanged;10synthetic privatefiles recovered, rawartifacts and ownstand removed. [Restore](telemetry/n8-20261002-1740/n8-f06-restore-1-receipt.md). `/next f04-product-ui` marks only local software done; F05/fullF06 remain dependent on realGPU.

F06a Sol resumed the interrupted writer in a new trace, actualSol6.1high; source8030270f, author907.026s, wrapper03:32:07Zexit0,18docs checks/41AC/174links passed. Author receipt preserves its earlier pendingUI/restore view. Coordinator reconciled the subsequently delivered actual evidence into the seven current documents; historical checks/hashes were not rewritten. Fresh independent Astra review is required on this integrated source. Usage/cost/provider-resolved model remain null.


## Replicate transition — I1 accepted (2026-10-03)

The hosted-provider plan passed independent Astra validation before implementation. I1 adds immutable one-shot submission authority and a separate, default-disabled spend envelope; it sends no HTTP requests. Sol6.1/high implementation and the one test-only correction were independently reviewed by Astra/high. The final real PostgreSQL16 TAP run passed16 tests (15 child scenarios plus their parent), including two contenders blocked across UTC midnight. Four protected product files remained unchanged during correction. Original review and runtime failures remain in telemetry; the narrow closure is [i1-r01-closure.md](features/f07-replicate/i1-r01-closure.md). The reviewer reached its verdict before a180-second timeout, then saved required artifacts in a70.615-second delivery-only continuation.

Next is I2 fixed-origin, bounded asynchronous transport, followed by private media import, worker wiring, provenance, mutations and actual Docker browser checks. Current external spend remains0; accepted DB tests do not prove hosted image quality, billing limits or full MVP readiness.


## Replicate transition — I2 accepted (2026-10-03)

The one-shot HTTPS adapter passed149 TAP tests (25 top-level,124 nested) and the unchanged2 I1 authority units under Node22. Fresh Astra/high accepted the exact2-file candidate7395d7a5 with zero findings; [i2-review.md](features/f07-replicate/i2-review.md) records the boundaries. Output references remain private internal handles, and no live provider call was made. Sol completed within the1500-second hard bound, but missed the1400-second receipt target by24.7seconds; that failed intermediate receipt remains intact alongside a separate completed immutable-delivery receipt. Next is I3 bounded private media preparation/import.


## Replicate transition — I3 accepted (2026-10-03)

Private image preparation/import passed150 affected Node22 TAP tests after independent review found and closed a two-frame APNG bypass in Sharp metadata. The bounded PNG chunk guard now rejects animation before decode; the real CRC-correct fixture fails against old code and passes against the fix. Prior DNS protection mutation also recorded green/red/restored-green. [I3 review](features/f07-replicate/i3-review.md) and [narrow closure](features/f07-replicate/i3-r01-closure.md) retain both the defect and its resolution. Input hashes,512-letterbox transform, same I2 time budget, DNS-pinned delivery and guarded private artifacts are implemented. No real provider request or image quality claim is made. The first author attempt encountered a model-capacity error; its saved code/checks were preserved and a bounded continuation delivered the unchanged artifacts. Next: I4 queue/worker lifecycle and cleanup wiring.
