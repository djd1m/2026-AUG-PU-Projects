// Presigned-URL кадра экрана результата (FR-LOOK-007, DEC-A-050) — ОДНА точка для ОБОИХ
// маршрутов, отдающих `ScanResponseOptions.photo` (`GET /api/v1/scans/{id}` и
// `POST /api/v1/scans/{id}/correct`): `../correct/response.ts` строит ОДНО тело ответа для
// них НАМЕРЕННО («поля обязаны совпадать буквально, иначе экран результата и ответ правки
// разойдутся молча») — раздельная логика вычисления кадра в двух маршрутах нарушила бы
// ровно это намерение и после первой же правки состав блюда фотография тихо исчезала бы.
//
// Кадр — НОРМАЛИЗОВАННАЯ копия (`photo.normalized_object_key`), НЕ оригинал (`object_key`):
//  - уже повёрнута по EXIF (`apps/recognizer/src/photo/normalize.ts`, `rotate()` ВЫЗЫВАЕТСЯ
//    до удаления метаданных) — оригинал в native-ориентации камеры потребовал бы поворота
//    на клиенте, которого экран результата не делает;
//  - заведомо ≤ 5 МБ (`CANON.normalizedMaxBytes`) — легче отдать presigned-ссылкой;
//  - ВСЕГДА `image/jpeg` — оригинал может быть HEIC (`photo.mime = 'image/heic'`,
//    `CHECK` в `001_init.sql`), который большинство браузеров не отрисовывают тегом `<img>`
//    вовсе (декодирует нативно практически только Safari/iOS).
//
// `null` — не «адрес неизвестен», а ОДИН из ДВУХ честных исходов
// (`.claude/rules/honest-configuration.md`, CFG-I1 «UNDEFINED — REFUSE/UNKNOWN, не
// правдоподобный дефолт»):
//   1) нормализации ещё не было — `queued`, либо она сама отказала
//      (`failed(normalize)`/`failed(schema_violation)`, `recognize-scan.ts` строка 226-227:
//      normalize — ПЕРВЫЙ шаг, до самого раннего исхода `refused`);
//   2) файл удалён по сроку 30 дней — `photo.file_state = 'purged'`
//      (`apps/recognizer/src/photo/purge-expired.ts`): `normalized_object_key` в строке БД
//      остаётся непустым и ПОСЛЕ удаления объекта из бакета, поэтому проверка ОБЯЗАНА
//      смотреть на `file_state`, а не только на непустоту ключа — иначе presigned-ссылка
//      была бы РАБОЧЕЙ ссылкой на пустоту, то есть тем самым выдуманным адресом, который
//      правило запрещает.
//
// Срок — `PRESIGN_TTL_SECONDS` (15 минут, ADR-010), ИМПОРТИРОВАН из `create-share-card.ts`,
// не продублирован отдельным литералом: там уже записано «тот же срок, что и presigned-URL
// фото владельца» — вторая независимая константа "15 минут" разошлась бы с первой молча
// (тот же класс риска, что `.claude/rules/port-conflicts-local.md` называет «два места с
// одним правилом»), а верхняя граница ≤ 15 минут — прямое требование `security.md`.
//
// ИСПРАВЛЕНИЕ (найдено живой проверкой на развёрнутом стенде `n4.212.192.0.33.sslip.io`,
// РОВНО тем шагом, который требует `deployment-seams.md`: «проверять на адресе, который
// ВЫДАЛО развёртывание, не на localhost» — здесь тот же принцип, только адрес не свой, а
// адрес хранилища). `PhotoStorage.presignedGetUrl` подписывает по `S3_ENDPOINT`
// (`docker-compose.yml`: `http://storage:9000` — имя сервиса compose). MinIO НЕ публикует
// порт наружу вовсе (`docker-ports.md`, Правило №0) — этот адрес разрешается ТОЛЬКО внутри
// сети compose; браузер посетителя `storage` не резолвит. Первый же живой запрос к
// `GET /api/v1/scans/{id}` вернул именно такую, нерабочую в браузере ссылку — тот же класс
// дефекта, что три P0 `deployment-seams.md` (юнит-тесты и `curl`/`app.inject` зелёные,
// дефект — только в браузере).
//
// РЕШЕНИЕ, а не расширение периметра: presigned-URL остаётся ВНУТРЕННИМ — вызывающий
// НАРУЖУ поле `photo_url` не отдаёт (`resolveScanPhoto` теперь непубличная функция файла,
// используется только маршрутом-прокси `../routes/scans-photo.ts`, который делает
// `fetch()` presigned-URL СЕРВЕРОМ и стримит байты обратно). Наружу отдаётся ссылка ТОГО ЖЕ
// origin, что и сама страница (`/api/v1/scans/{id}/photo`) — уже проксируется Caddy
// (`handle /api/* { reverse_proxy api:3000 }`), инфраструктура НЕ меняется. Тот же приём уже
// применён в `../routes/share-card-internal.ts` (`/image`) для публичной карточки; здесь —
// то же самое, плюс проверка ВЛАДЕНИЯ (публичная карточка её не делает намеренно, кадр скана
// — приватный). `resolveScanPhotoResponse` — то, что видят `scans.ts`/`scans-correct.ts`.

import type { DbPool } from '@n4/db';
import type { PhotoStorage } from './store-original.js';
import { PRESIGN_TTL_SECONDS } from '../share/create-share-card.js';
import type { ScanPhotoInfo } from '../correct/response.js';

const SELECT_PHOTO_FOR_URL = `SELECT normalized_object_key, file_state::text AS file_state FROM photo WHERE id = $1`;

/**
 * ВНУТРЕННИЙ presigned-URL (реальный адрес хранилища) — экспортирован только для
 * `../routes/scans-photo.ts`, который единственный имеет право его РАЗРЕШАТЬ (`fetch`).
 * Наружу (в JSON-ответ) он не попадает НИКОГДА — см. `resolveScanPhotoResponse`.
 *
 * `photoId` — `recognition.photo_id` (может быть `NULL`, `ON DELETE SET NULL`). Один
 * дополнительный `SELECT` за вызов — сознательно: и `GET /scans/{id}`, и `POST
 * /scans/{id}/correct` уже делают несколько последовательных запросов на маршрут
 * (`security-operation-order.md` о них не говорит — это не разделяемый ресурс), а держать
 * кадр в ТОМ ЖЕ джойне, что основную строку `recognition`, означало бы либо дублировать
 * JOIN в трёх местах `scans-correct.ts` (основная ветка правки, ветка чистого поиска
 * `replace_item`, и здесь), либо провести отдельную правку тех запросов — второе не входит
 * в объявленную задачу и рискует потерей столбца, который никто явно не проверяет тестом.
 */
export async function resolveScanPhoto(pool: DbPool, storage: PhotoStorage, photoId: string | null): Promise<ScanPhotoInfo | null> {
  if (photoId === null) return null;
  const result = await pool.query<{ normalized_object_key: string | null; file_state: string }>(SELECT_PHOTO_FOR_URL, [photoId]);
  const row = result.rows[0];
  if (row === undefined) return null;
  if (row.normalized_object_key === null) return null;
  if (row.file_state !== 'present') return null;
  const url = await storage.presignedGetUrl(row.normalized_object_key, PRESIGN_TTL_SECONDS);
  const expiresAt = new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000).toISOString();
  return { url, expiresAt };
}

/**
 * ПУБЛИЧНОЕ поле `photo_url` ответа (`GET`/`POST .../correct`) — путь СВОЕГО origin, не
 * ссылка на хранилище. `scanId` в пути виден и так (владелец его уже знает — это `scan_id`
 * того же ответа), проверка владения выполняется ЗАНОВО на каждый GET `/photo`
 * (`../routes/scans-photo.ts`), а не наследуется из этого вызова.
 */
export async function resolveScanPhotoResponse(pool: DbPool, storage: PhotoStorage, scanId: string, photoId: string | null): Promise<ScanPhotoInfo | null> {
  const internal = await resolveScanPhoto(pool, storage, photoId);
  if (internal === null) return null;
  return { url: `/api/v1/scans/${scanId}/photo`, expiresAt: internal.expiresAt };
}
