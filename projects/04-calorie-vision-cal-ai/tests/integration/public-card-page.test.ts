// `GET /c/{card_id}` (RenderPublicCardPage, маршрут 6 канона). AC-7/8/9/10.
//
// `apps/web`'s Route Handler'ы (`app/c/[cardId]/route.ts`, `.../image/route.ts`) — обычные async
// функции `GET(request, context)`, возвращающие `Response`; вызываются здесь НАПРЯМУЮ (без
// поднятия Next.js dev/build сервера — правило репозитория не запрещает импортировать модуль
// напрямую, а Next не требует своего рантайма для чистого Route Handler без React). Их
// собственный `fetch(...)` идёт на РЕАЛЬНЫЙ `api`, поднятый здесь же через `buildServer().listen()`
// на эфемерном порте — `app.inject()` не годится: `fetch` внутри web не умеет диспетчеризоваться
// в Fastify-инстанс, ему нужен настоящий TCP-адрес. `API_INTERNAL_URL` веб-конфига
// (`apps/web/env.ts`) указывает на этот адрес вместо `http://api:3000`.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { createPhotoStorage } from '../../apps/api/src/photo/store-original.js';
import { generateSessionToken, hashSessionToken } from '../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testScanApiConfig } from '../helpers/scan-config.js';
import { makeJpegFixture } from '../helpers/image-fixtures.js';
import { GET as getCardPage } from '../../apps/web/app/c/[cardId]/route.js';
import { GET as getCardImage } from '../../apps/web/app/c/[cardId]/image/route.js';

let pool: DbPool;
let app: FastifyInstance;
let apiInternalUrl: string;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-public-card-page');
  const storage = createPhotoStorage(testScanApiConfig().storage);
  app = buildServer({ config: testScanApiConfig(), pool, logger: createLogger({ service: 'api-test', sink: () => {} }), storage });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('эфемерный порт не выдан');
  apiInternalUrl = `http://127.0.0.1:${address.port}`;
  process.env.API_INTERNAL_URL = apiInternalUrl;
}, 60_000);

afterAll(async () => {
  await app.close();
  await pool.end();
  delete process.env.API_INTERNAL_URL;
});

beforeEach(async () => {
  await truncateAll(pool);
});

// Форма — РЕАЛЬНАЯ персистентная форма `persistedItem` (см. тот же комментарий в
// `tests/integration/share-cards-route.test.ts`, RV-share-card-and-growth-events-01): `mass_g` +
// снимок per-100г, БЕЗ готовых `kcal/protein/fat/carb` на позиции.
const MATCHED_ITEM = {
  label_ru: 'Тост с авокадо',
  mass_g: 150,
  unmatched: false,
  food_item_id: '00000000-0000-0000-0000-000000000001',
  source_snapshot: { source: 'USDA-FDC', source_id: '999', kcal_per_100g: 207, protein_per_100g: 6.0, fat_per_100g: 12.0, carb_per_100g: 18.0 },
};

async function seedOpenCard(marker: string): Promise<string> {
  const storage = createPhotoStorage(testScanApiConfig().storage);
  const session = await pool.query<{ id: string }>(
    `INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at, consent_at)
     VALUES ($1, '203.0.113.0/24', now() + interval '7 days', now()) RETURNING id`,
    [hashSessionToken(generateSessionToken())],
  );
  const sessionId = session.rows[0]!.id;
  const objectKey = `photos/${marker}.jpg`;
  await storage.putOriginal(objectKey, await makeJpegFixture(), 'image/jpeg');
  const photo = await pool.query<{ id: string }>(
    `INSERT INTO photo (device_session_id, object_key, mime, bytes, width, height, expires_on) VALUES ($1, $2, 'image/jpeg', 1024, 800, 600, current_date + 30) RETURNING id`,
    [sessionId, objectKey],
  );
  const recognition = await pool.query<{ id: string }>(
    `INSERT INTO recognition (device_session_id, photo_id, status, items) VALUES ($1, $2, 'done', $3::jsonb) RETURNING id`,
    [sessionId, photo.rows[0]!.id, JSON.stringify([MATCHED_ITEM])],
  );
  const cardObjectKey = `share-cards/${recognition.rows[0]!.id}.jpg`;
  await storage.putOriginal(cardObjectKey, await makeJpegFixture(1080, 1920), 'image/jpeg');
  const card = await pool.query<{ id: string }>(
    `INSERT INTO share_card (owner_key, recognition_id, object_key, badge_rendered) VALUES ($1, $2, $3, false) RETURNING id`,
    [sessionId, recognition.rows[0]!.id, cardObjectKey],
  );
  return card.rows[0]!.id;
}

function requestFor(cardId: string): Request {
  return new Request(`http://web.internal/c/${cardId}`);
}

describe('GET /c/{card_id}', () => {
  it('AC-7: удалённая (revoked_at), никогда не существовавшая и синтаксически невалидная карточки дают ОДИН и тот же 404', async () => {
    const revokedId = await seedOpenCard('ac7-revoked');
    await pool.query('UPDATE share_card SET revoked_at = now() WHERE id = $1', [revokedId]);

    const responses = await Promise.all([
      getCardPage(requestFor(revokedId), { params: Promise.resolve({ cardId: revokedId }) }),
      getCardPage(requestFor('00000000-0000-0000-0000-000000000099'), { params: Promise.resolve({ cardId: '00000000-0000-0000-0000-000000000099' }) }),
      getCardPage(requestFor('not-a-uuid'), { params: Promise.resolve({ cardId: 'not-a-uuid' }) }),
    ]);
    for (const response of responses) expect(response.status).toBe(404);
    const bodies = await Promise.all(responses.map((r) => r.text()));
    expect(new Set(bodies).size).toBe(1); // ОДНО и то же тело у всех трёх — причина не просачивается
  });

  it('AC-8: Cache-Control: no-store присутствует на успехе И на всех вариантах 404', async () => {
    const openId = await seedOpenCard('ac8-open');
    const revokedId = await seedOpenCard('ac8-revoked');
    await pool.query('UPDATE share_card SET revoked_at = now() WHERE id = $1', [revokedId]);

    const open = await getCardPage(requestFor(openId), { params: Promise.resolve({ cardId: openId }) });
    expect(open.status).toBe(200);
    expect(open.headers.get('Cache-Control')).toBe('no-store');

    for (const cardId of [revokedId, '00000000-0000-0000-0000-000000000098', 'invalid']) {
      const response = await getCardPage(requestFor(cardId), { params: Promise.resolve({ cardId }) });
      expect(response.status, cardId).toBe(404);
      expect(response.headers.get('Cache-Control'), cardId).toBe('no-store');
    }
  });

  it('AC-9: отзыв согласия МЕЖДУ двумя запросами к ОДНОМУ адресу — второй запрос 404, живая проверка, не кэш', async () => {
    const cardId = await seedOpenCard('ac9');

    const first = await getCardPage(requestFor(cardId), { params: Promise.resolve({ cardId }) });
    expect(first.status).toBe(200);

    await pool.query('UPDATE share_card SET revoked_at = now() WHERE id = $1', [cardId]);

    const second = await getCardPage(requestFor(cardId), { params: Promise.resolve({ cardId }) });
    expect(second.status).toBe(404);

    // Presigned-URL для уже отозванной карточки не минтится — картиночный маршрут ТОЖЕ 404
    // (живая проверка на ОБОИХ путях, не только на HTML).
    const image = await getCardImage(requestFor(`${cardId}/image`), { params: Promise.resolve({ cardId }) });
    expect(image.status).toBe(404);
  });

  it('AC-10: успешный просмотр анонимным зрителем пишет card_view от имени ВЛАДЕЛЬЦА с ЕГО partner_code_id, без cookie и IP зрителя', async () => {
    // ПРАВКА ПОСЛЕ РЕВЬЮ (RV-share-card-and-growth-events-05): прежняя фикстура не заводила
    // партнёрскую атрибуцию вовсе — `partner_code_id IS NULL` совпал бы и при верном, и при
    // сломанном коде (`resolveOwnerGrowthContext`, `apps/api/src/growth/record-growth-event.ts`).
    // Теперь владелец карточки РЕАЛЬНО атрибутирован партнёрскому коду.
    const cardId = await seedOpenCard('ac10');
    const cardRow = await pool.query<{ owner_key: string }>('SELECT owner_key FROM share_card WHERE id = $1', [cardId]);
    const ownerKey = cardRow.rows[0]!.owner_key;

    const partner = await pool.query<{ id: string }>(`INSERT INTO partner (display_name, contact) VALUES ('Тестовый партнёр', 'test@partner.example') RETURNING id`);
    const partnerCode = await pool.query<{ id: string }>(
      `INSERT INTO partner_code (partner_id, code) VALUES ($1, 'AC10CODE') RETURNING id`,
      [partner.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO attribution (device_session_id, partner_code_id, status, source, activated_at) VALUES ($1, $2, 'activated', 'deeplink', now())`,
      [ownerKey, partnerCode.rows[0]!.id],
    );

    // Три РАЗНЫХ анонимных клиента — разные заголовки адреса (архитектурно ИГНОРИРУЮТСЯ этим
    // маршрутом, NFR-2, но заголовок всё равно передаётся РАЗНЫМ на каждый запрос, чтобы
    // отсутствие влияния было проверено, а не предположено).
    const viewerAddresses = ['203.0.113.10', '198.51.100.20', '192.0.2.30'];
    for (const address of viewerAddresses) {
      const request = new Request(`http://web.internal/c/${cardId}`, { headers: { 'x-forwarded-for': address } });
      const response = await getCardPage(request, { params: Promise.resolve({ cardId }) });
      expect(response.status, address).toBe(200);
      expect(response.headers.get('Set-Cookie')).toBeNull(); // зрителю НЕ ставится cookie
    }
    // Четвёртый запрос — к чужому/несуществующему адресу, событие не создаёт.
    await getCardPage(requestFor('00000000-0000-0000-0000-000000000097'), {
      params: Promise.resolve({ cardId: '00000000-0000-0000-0000-000000000097' }),
    });

    const events = await pool.query<{ device_session_id: string; partner_code_id: string | null }>(
      `SELECT device_session_id, partner_code_id FROM growth_event WHERE share_card_id = $1 AND type = 'card_view'`,
      [cardId],
    );
    expect(events.rowCount).toBe(3); // РОВНО три, четвёртый (404) не породил события
    for (const row of events.rows) {
      expect(row.device_session_id).toBe(ownerKey); // от имени ВЛАДЕЛЬЦА, не зрителя
      expect(row.partner_code_id).toBe(partnerCode.rows[0]!.id); // атрибуция ВЛАДЕЛЬЦА, не зрителя (у зрителя её и не может быть — он без сессии)
    }
  });
});
