// «Поделиться» — `POST /api/v1/share-cards` с `{ recognition_id }` (маршрут 5 канона,
// FR-GROWTH-001). Тот же приём, что и `diary-confirm-request.ts`: чистая функция, без DOM.
//
// Сервер требует согласие ТАК ЖЕ, как запись в дневник (`apps/api/src/share/create-share-card.ts`,
// `preCheck`/`createShareCardGuarded` — оба исхода `refused` дают `403 consent_required`) — карточка
// несёт состав блюда, те же данные о питании. Экран результата обязан уметь увести на согласие и
// отсюда, а не только из «в дневник».

export interface ShareCreateRequest {
  readonly url: string;
  readonly init: RequestInit;
}

export function buildShareCreateRequest(recognitionId: string): ShareCreateRequest {
  return {
    url: '/api/v1/share-cards',
    init: {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recognition_id: recognitionId }),
    },
  };
}

export type ShareCreateOutcome =
  | { readonly kind: 'created'; readonly cardId: string; readonly url: string }
  | { readonly kind: 'consent_required' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'not_done' }
  | { readonly kind: 'error'; readonly message: string };

interface ShareBody {
  readonly data?: { readonly card_id?: unknown; readonly url?: unknown };
}

/** Разбор ответа `POST /share-cards`: `200`/`201` (создана либо уже существовала) несут ОДНУ и ту
 * же форму тела (`routes/share-cards.ts`) — код различает их только для семантики HTTP, экран
 * ведёт себя одинаково на обоих. */
export async function parseShareCreateResponse(response: Response): Promise<ShareCreateOutcome> {
  if (response.status === 200 || response.status === 201) {
    const body = (await response.json().catch(() => null)) as ShareBody | null;
    const cardId = body?.data?.card_id;
    const url = body?.data?.url;
    if (typeof cardId !== 'string' || cardId === '' || typeof url !== 'string' || url === '') {
      return { kind: 'error', message: 'Сервер принял запрос, но не вернул адрес карточки — попробуйте ещё раз.' };
    }
    return { kind: 'created', cardId, url };
  }
  if (response.status === 403) return { kind: 'consent_required' };
  if (response.status === 404) return { kind: 'not_found' };
  if (response.status === 409) return { kind: 'not_done' };
  return { kind: 'error', message: `Сервер ответил неожиданно (${response.status}) — попробуйте ещё раз.` };
}

/** Абсолютный адрес карточки для `navigator.share`/буфера — `url` сервера уже готов
 * (`/c/<id>`), здесь он лишь соединяется с origin страницы (RV: относительный путь нельзя
 * положить в буфер или передать в `navigator.share` как есть — вне страницы у него нет origin). */
export function absoluteCardUrl(relativeUrl: string, origin: string): string {
  return new URL(relativeUrl, origin).toString();
}
