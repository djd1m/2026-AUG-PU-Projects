// `GET /c/{card_id}/image` — байты изображения карточки, отдельным маршрутом от HTML
// (`../route.ts` объясняет почему: раздельные запросы браузера не должны удваивать
// `growth_event(card_view)`). Проксирует ответ внутреннего `api`-маршрута
// `GET /internal/share-cards/:cardId/image`, который сам стримит байты из приватного бакета —
// `web` не хранит и не видит ключей S3 (`03_architecture.md`, «web без секретов вызова наружу»).

import { loadWebConfig } from '../../../../env';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ cardId: string }> }): Promise<Response> {
  const { cardId } = await context.params;
  const { apiInternalUrl } = loadWebConfig();

  const upstream = await fetch(`${apiInternalUrl}/internal/share-cards/${encodeURIComponent(cardId)}/image`, { cache: 'no-store' });
  if (!upstream.ok || upstream.body === null) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'image/jpeg', 'Cache-Control': 'no-store' },
  });
}
