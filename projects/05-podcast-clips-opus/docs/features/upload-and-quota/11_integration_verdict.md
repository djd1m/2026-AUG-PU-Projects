# Интеграционная проверка раунда исправлений фичи 2 — вердикт integration owner

**Прогон:** `docker compose --project-directory . --env-file <test.env> --profile test run --rm test`
в ИЗОЛИРОВАННОМ стеке `n5-clipmaker-test` (отдельное имя проекта, чтобы не затронуть демо-стенд).
Дата 22.09.2026. Codex этот прогон выполнить не мог — у него нет доступа к docker, и он честно
пометил свой отчёт `Status: failed`.

## Итог

`Test Files 2 failed | 20 passed (22)` · `Tests 1 failed | 140 passed | 11 skipped (152)` · `EXIT=1`

Оба отказа прослежены до причины. Один — дефект конструкции, второй — бюджет времени теста.

## RI-001 · blocker · проверка lifecycle делает загрузку невозможной на MinIO

`packages/s3/src/lifecycle.ts` → `assertMultipartLifecycle` вызывается из
`packages/s3/src/multipart.ts:14` ПЕРЕД каждым `CreateMultipartUpload` и бросает исключение, если на
бакете нет правила `AbortIncompleteMultipartUpload` с `DaysAfterInitiation = 1` на весь бакет.

**Измерено на MinIO `RELEASE.2025-04-22T22-12-26Z`** (тот же образ, что в `docker-compose.yml`),
SDK `aws-sdk-js/3.1136.0`, тело запроса перехвачено и прочитано:

| Правило | Ответ MinIO |
|---|---|
| только `AbortIncompleteMultipartUpload`, `<Filter/>` | `InvalidArgument` |
| только `AbortIncompleteMultipartUpload`, `<Filter><Prefix>videos/</Prefix></Filter>` | `InvalidArgument` |
| только `Expiration Days=30` | принято |
| `Expiration` + `AbortIncompleteMultipartUpload` | **принято, но обратно читается БЕЗ `Abort`** |

XML, который отвергается, схеме AWS соответствует:
`<Rule><Status>Enabled</Status><ID>…</ID><Filter/><AbortIncompleteMultipartUpload><DaysAfterInitiation>1</DaysAfterInitiation></AbortIncompleteMultipartUpload></Rule>`

Четвёртая строка — худшая: правило принимается, а при чтении его половины нет. Значит условие
`assertMultipartLifecycle` не выполнимо на MinIO НИКАКИМ способом, и fail-closed превращается в
«загрузка не работает никогда».

**Почему это дефект конструкции, а не среды.** Обмен получился такой: вместо риска «часть брошенных
multipart занимает место в хранилище» (цена — деньги за хранение, обратимо) принят риск «продукт не
принимает ни одного файла» (цена — продукта нет). Плюс проверка требует права
`s3:GetBucketLifecycleConfiguration` у прикладного ключа и добавляет сетевой вызов перед каждой
загрузкой; на Cloud.ru ни право, ни поддержка правила не проверены — там это тот же отказ, только
обнаруженный на боевом стенде.

**Требуемое направление правки (решает Codex, обоснование — за ним):** страховка от сирот не может
быть ПРЕДУСЛОВИЕМ загрузки. Либо наблюдение с предупреждением (проверить один раз на старте, писать
в журнал, но НЕ блокировать), либо собственный сборщик: `ListMultipartUploads` + `AbortMultipartUpload`
для загрузок старше суток — он не зависит от поддержки lifecycle поставщиком и проверяется на MinIO.
Место сборщика — сторож фичи 3 либо фича 12 `retention-and-erasure`.

## RI-002 · high · тест RU-001 не укладывается в собственный бюджет

`tests/s3-slow.integration.test.ts` — `Test timed out in 20000ms`. При этом ГЛАВНОЕ измерение теста
получено и подтверждает правку: `{"complete_elapsed_ms": 5551.9}` — `CompleteMultipartUpload`
пережил 5 секунд, то есть прежний общий таймаут 5 с действительно снят. Падает вторая половина
сценария: `HEAD` с таймаутом 5 с и тремя попытками SDK не помещается в оставшееся время.

Это бюджет теста, а не поведение продукта. Правка — поднять `testTimeout` этого файла до величины,
покрывающей 5,5 с + 3 × 5 с + запас, и назвать её в коде числом с обоснованием.

## Что этот прогон ДОКАЗАЛ

- 140 тестов зелёные на настоящих PostgreSQL 16, Redis 7 и MinIO, включая новые тесты раунда.
- Снятие общего таймаута 5 с у `CompleteMultipartUpload` подтверждено измерением 5551 мс.

## Чего он НЕ доказывает

- Конкурентные свойства RU-002 (`idle in transaction` не растёт) — соответствующие сценарии написаны,
  но суммарный прогон упал раньше на RI-001; отдельного подтверждения нет.
- Совместимость с Cloud.ru — не проверялась вовсе (DEC-A-005, ручная приёмка владельца).

Status: completed
