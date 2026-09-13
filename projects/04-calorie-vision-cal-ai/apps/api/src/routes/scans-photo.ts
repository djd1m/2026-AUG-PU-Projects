// `GET /api/v1/scans/{id}/photo` — байты кадра экрана результата (FR-LOOK-007, DEC-A-050).
//
// Существует ИМЕННО потому, что MinIO не публикует порт наружу (`docker-ports.md`, Правило
// №0) — `photo_url`, отдаваемый `GET`/`POST .../correct`, указывает СЮДА (тот же origin),
// а не на хранилище напрямую: см. историю дефекта в `../photo/photo-url.ts` (обнаружено
// живой проверкой на развёрнутом стенде — presigned-URL с `S3_ENDPOINT = http://storage:9000`
// не резолвится браузером посетителя). Маршрут внутри resolvит presigned-URL и стримит
// байты САМ — тот же приём, что и `share-card-internal.ts` (`/image`), с ОДНИМ отличием:
// там карточка публичная и владения не проверяет, здесь кадр приватный — владение
// проверяется тем же кодом, что и `GET /scans/{id}` (`requireSession`).

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DbPool } from '@n4/db';
import { fail, type Logger } from '@n4/shared';
import { requireSession } from './scans.js';
import { resolveScanPhoto } from '../photo/photo-url.js';
import type { PhotoStorage } from '../photo/store-original.js';

export interface ScansPhotoRouteDeps {
  readonly pool: DbPool;
  readonly storage: PhotoStorage;
  readonly logger: Logger;
}

const SELECT_PHOTO_ID = `SELECT photo_id FROM recognition WHERE id = $1 AND device_session_id = $2`;

export function registerScansPhotoRoute(app: FastifyInstance, deps: ScansPhotoRouteDeps): void {
  app.get('/api/v1/scans/:id/photo', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    reply.header('Cache-Control', 'private, no-store');

    const session = await requireSession(request, deps.pool);
    if (session === null) return reply.code(401).send(fail('unauthenticated', 'сессия отсутствует'));

    const result = await deps.pool.query<{ photo_id: string | null }>(SELECT_PHOTO_ID, [request.params.id, session.deviceSessionId]);
    const row = result.rows[0];
    // Чужой скан, несуществующий скан И скан без доступного кадра — ОДИН и тот же `404`
    // (`security.md`, «404, а не 403»): отдельный код для «кадра нет» подтвердил бы
    // существование чужого скана, а перебор `id` и есть способ это проверить.
    if (row === undefined) return reply.code(404).send(fail('not_found', 'кадр не найден'));

    const photo = await resolveScanPhoto(deps.pool, deps.storage, row.photo_id);
    if (photo === null) return reply.code(404).send(fail('not_found', 'кадр не найден'));

    let upstream: Response;
    try {
      upstream = await fetch(photo.url);
    } catch (error) {
      deps.logger.error('scan_photo_fetch_failed', { message: (error as Error).message });
      return reply.code(503).send(fail('dependency_unavailable', 'хранилище недоступно'));
    }
    if (!upstream.ok || upstream.body === null) {
      return reply.code(404).send(fail('not_found', 'кадр не найден'));
    }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    return reply.code(200).header('Content-Type', 'image/jpeg').send(bytes);
  });
}
