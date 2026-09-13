# Квитанция — фото на экране результата (FR-LOOK-007, DEC-A-050)

## Задача

Экран результата не показывал кадр: `GET /api/v1/scans/{id}` не нёс адреса кадра вовсе.
Требовалось: добавить поле в ответ (GET и, по факту разбора, `correct`), presigned-URL
владельцу ≤ 15 минут, `404` для чужого/несуществующего скана, показать кадр на экране,
подписи ингредиентов поверх фото — осознанный пропуск.

## Какой кадр выбран и почему

**Нормализованная копия** (`photo.normalized_object_key`), не оригинал:
- уже повёрнута по EXIF (`apps/recognizer/src/photo/normalize.ts`, `rotate()` до удаления
  метаданных) — оригинал потребовал бы поворота на клиенте;
- заведомо ≤ 5 МБ, легче отдавать;
- ВСЕГДА `image/jpeg` — оригинал может быть HEIC (`photo.mime = 'image/heic'`), который
  большинство браузеров не отрисовывают тегом `<img>` вовсе.

`null` — ДВА законных исхода (не «неизвестно», честный отказ по `honest-configuration.md`
CFG-I1): (1) нормализации ещё не было — `queued`, либо `failed(normalize|schema_violation)`
(нормализация — ПЕРВЫЙ шаг recognizer, до самого раннего `refused`); (2) файл удалён по
сроку 30 дней (`photo.file_state = 'purged'`, `purge-expired.ts`) — `normalized_object_key`
в строке БД остаётся непустым и после удаления объекта, поэтому проверка обязательно
смотрит на `file_state`, а не только на непустоту ключа.

## Как выдаётся подпись — и НАЙДЕННЫЙ + ИСПРАВЛЕННЫЙ дефект стыка

Первая версия (`resolveScanPhoto`) отдавала `photo_url` = сырой presigned-URL MinIO
(`storage.presignedGetUrl`, `X-Amz-Expires=900`). Все юнит- и интеграционные тесты (включая
`app.inject`) были зелёными. **Обязательная живая проверка на развёрнутом стенде**
(`n4.212.192.0.33.sslip.io`, требование задачи и `deployment-seams.md`) вскрыла: адрес был
`http://storage:9000/...` — имя сервиса compose. MinIO не публикует порт наружу
(`docker-ports.md`, Правило №0), поэтому браузер посетителя этот хост не резолвит вовсе.
Тот же класс дефекта, что три P0 в `deployment-seams.md`: юнит-тест и `curl`/`app.inject`
зелёные, дефект — только в браузере.

**Исправление, без изменения инфраструктуры** (Caddyfile и `docker-compose.yml` не тронуты):
- `resolveScanPhoto` (`apps/api/src/photo/photo-url.ts`) остался внутренней функцией —
  presigned-URL MinIO наружу больше не попадает никогда;
- новый маршрут `GET /api/v1/scans/{id}/photo` (`apps/api/src/routes/scans-photo.ts`) —
  тот же приём, что уже применён в `share-card-internal.ts` (`/image`): резолвит presigned-
  URL и стримит байты САМ (`fetch` сервером), плюс проверка ВЛАДЕНИЯ (публичная карточка её
  не делает, кадр скана — приватный: `requireSession`, `404` для чужого/несуществующего/
  недоступного — один и тот же ответ);
- `photo_url` в JSON-ответе теперь — путь СВОЕГО origin (`/api/v1/scans/{id}/photo`),
  уже проксируемый Caddy как часть `handle /api/* { reverse_proxy api:3000 }` — инфра не
  менялась;
- `photo_url_expires_at` остался (15 минут, `PRESIGN_TTL_SECONDS` из `create-share-card.ts`,
  не задвоен отдельным литералом) — срок относится к ВНУТРЕННЕЙ подписи, путь `/photo`
  стабилен, пока жива сессия-владелец.

Живая перепроверка после исправления (см. «Проверено» ниже) подтвердила реальные JPEG-байты
через публичный `https://n4.212.192.0.33.sslip.io/...`.

## Проброс через correct

`buildScanResponse` — ОДНА функция для `GET` и `POST .../correct` (комментарий файла:
«поля обязаны совпадать буквально, иначе экран результата и ответ правки разойдутся
молча»). Без правки `scans-correct.ts` кадр пропадал бы с экрана после ЛЮБОГО действия
(степпер, замена, удаление) — починено для ОБЕИХ веток: основной транзакции правки и
отдельной ветки чистого поиска (`replace_item` + `query`). Presigned-URL считается ПОСЛЕ
закрытия транзакции (`shared-resource-verification.md`, вопрос 1) — сетевой вызов клиента
хранилища не держит блокировку `FOR UPDATE`.

## Что НЕ сделано — осознанный пропуск

Подписи ингредиентов ПОВЕРХ фото НЕ нарисованы (часть FR-LOOK-007). У нас нет координат
позиций на кадре — рисовать их наугад означало бы показать выдуманное
(`fail-closed-defaults.md`). Отмечено в коде (`result-screen.tsx`, комментарий у блока
`.result__photo`).

## Проверено

- `npx vitest run` (юнит, workspace root) — 362/362 зелёных.
- `npm run lint`, `npm run typecheck`, `npm run build` — 0 во всех трёх прогонах (до и после
  правки маршрута `/photo`).
- `docker compose --profile test run --rm -T test sh -lc 'npm run test:integration'` — ДВА
  полных прогона: 274/274, затем (после правки маршрута `/photo`) 275/275, оба зелёные
  (68/68 файлов).
- Владелец получает `photo_url`; чужая сессия — тот же `404`, что для несуществующего скана
  (`tests/integration/routes/scans.test.ts`).
- Скан без кадра (нормализации не было) — `photo_url = null` (не выдуманный адрес).
- Фото удалено по сроку 30 дней (`file_state = 'purged'`) — `photo_url = null`, а не ссылка
  на пустоту.
- `photo_url` не пропадает после `set_portion`/`replace_item` (`tests/integration/routes/
  scans-correct.test.ts`).
- `GET /api/v1/scans/{id}/photo` отдаёт реальные байты владельцу; чужая сессия и
  несуществующий скан — ОДИН и тот же `404`.
- **Страж по журналу — испытан на внедрённом дефекте** (`guard-must-be-able-to-fail.md`):
  временно добавил `'photo_url'` в `SERVICE_LOG_FIELDS` (`packages/shared/src/log/
  logger.ts`) → ДВА новых теста `log-hygiene.test.ts` красные (`AssertionError`), код
  восстановлен → 7/7 зелёные. Доказано: закрытый список разрешённых полей — реальная
  защита, не полагание на «код нигде не логирует photo_url сегодня».
- **Живая проверка на развёрнутом стенде** (после пересборки `api`+`web`, профиль `edge`
  НЕ останавливался — `db`/`storage`/`proxy`/`recognizer` не трогались):
  - `POST /api/v1/scans` → `POST /api/v1/auth/device` → реальный скан, реальный recognizer
    (фейковый провайдер, DEC-A-009) обработал его до `refused(no_food_detected)` (сплошной
    цвет, ожидаемо) — и `photo_url` в ответе присутствует, потому что нормализация проходит
    ДО вызова модели даже на этом исходе;
  - `photo_url` = `/api/v1/scans/{id}/photo` (не адрес хранилища);
  - `GET https://n4.212.192.0.33.sslip.io/api/v1/scans/{id}/photo` → `200`,
    `Content-Type: image/jpeg`, `Cache-Control: private, no-store`, реальные байты
    (800×600 JPEG, проверено `PIL.Image.open`);
  - чужая сессия на тот же путь → `404`;
  - `GET /result/{id}` → `200`.

## Осталось непроверенным (с причиной)

- Визуальная проверка в настоящем браузере (скругление, `object-fit: cover`, пропорция
  4:3) — только curl/PIL-проверка байтов и статус-кодов; браузерного E2E-прогона у фичи нет
  (тот же недостижимый слой, что и у `source-and-correct`, см. её квитанцию).
- HEIC-оригинал на реальном iPhone не прогнан живьём — нормализация HEIC уже покрыта
  `tests/unit/photo/normalize.test.ts` (AC-scan-pipeline-9), здесь заново не гонялось.

## Изменённые/новые файлы

- `apps/api/src/correct/response.ts` — `ScanRow.photo_id`, `ScanPhotoInfo`,
  `ScanResponseOptions.photo`, поля `photo_url`/`photo_url_expires_at` в теле.
- `apps/api/src/photo/photo-url.ts` (новый) — `resolveScanPhoto` (внутренний presigned-URL),
  `resolveScanPhotoResponse` (публичный путь `/photo`).
- `apps/api/src/routes/scans-photo.ts` (новый) — `GET /api/v1/scans/{id}/photo`, проксирует
  байты, проверяет владение.
- `apps/api/src/routes/scans.ts` — `SELECT_SCAN_ROW` + `photo_id`, вызов
  `resolveScanPhotoResponse` в GET.
- `apps/api/src/routes/scans-correct.ts` — `storage` в `ScansCorrectRouteDeps`, `photo_id` в
  обеих SELECT/RETURNING, `resolveScanPhotoResponse` в обеих ветках.
- `apps/api/src/server.ts` — регистрация `registerScansPhotoRoute`, `storage` в
  `registerScansCorrectRoute`.
- `apps/web/app/globals.css` — `.result__photo` (aspect-ratio 4/3, `object-fit: cover`,
  `border-radius: var(--radius-l)`).
- `apps/web/app/result/result-screen.tsx` — `ScanResultResponse.photo_url`/
  `photo_url_expires_at`, блок кадра над плитками, `null` не рисуется вовсе.
- `tests/integration/routes/scans.test.ts`, `tests/integration/routes/scans-correct.test.ts`,
  `tests/integration/log-hygiene.test.ts`, `tests/integration/web-result-screen.test.tsx` —
  новые тесты (перечислены в «Проверено»).

Status: completed
