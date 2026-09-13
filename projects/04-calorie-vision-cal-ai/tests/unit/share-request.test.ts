// `buildShareCreateRequest`/`parseShareCreateResponse`/`absoluteCardUrl` (задача N4,
// «поделиться»). Сервер требует согласие ТАК ЖЕ, как запись дневника
// (`apps/api/src/share/create-share-card.ts`) — 403 разбирается идентично.

import { describe, expect, it } from 'vitest';
import { absoluteCardUrl, buildShareCreateRequest, parseShareCreateResponse } from '../../apps/web/app/result/share-request';

const RECOGNITION_ID = 'scan-abc';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('buildShareCreateRequest', () => {
  it('POST /api/v1/share-cards с { recognition_id }', () => {
    const { url, init } = buildShareCreateRequest(RECOGNITION_ID);
    expect(url).toBe('/api/v1/share-cards');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body as string)).toEqual({ recognition_id: RECOGNITION_ID });
  });
});

describe('parseShareCreateResponse', () => {
  it('201 created -> created с card_id и url', async () => {
    const outcome = await parseShareCreateResponse(jsonResponse({ data: { card_id: 'c1', url: '/c/c1' } }, 201));
    expect(outcome).toEqual({ kind: 'created', cardId: 'c1', url: '/c/c1' });
  });

  it('200 existing -> тот же исход created (одинаковое поведение экрана на обоих кодах)', async () => {
    const outcome = await parseShareCreateResponse(jsonResponse({ data: { card_id: 'c1', url: '/c/c1' } }, 200));
    expect(outcome).toEqual({ kind: 'created', cardId: 'c1', url: '/c/c1' });
  });

  it('200/201 без card_id/url в теле -> error, а не подставленная пустота', async () => {
    const outcome = await parseShareCreateResponse(jsonResponse({ data: {} }, 201));
    expect(outcome.kind).toBe('error');
  });

  it('403 consent_required -> consent_required', async () => {
    expect(await parseShareCreateResponse(jsonResponse({ error: { code: 'consent_required' } }, 403))).toEqual({ kind: 'consent_required' });
  });

  it('404 -> not_found, 409 -> not_done', async () => {
    expect(await parseShareCreateResponse(jsonResponse({}, 404))).toEqual({ kind: 'not_found' });
    expect(await parseShareCreateResponse(jsonResponse({}, 409))).toEqual({ kind: 'not_done' });
  });
});

describe('absoluteCardUrl', () => {
  it('соединяет относительный /c/<id> с origin страницы', () => {
    expect(absoluteCardUrl('/c/abc', 'https://n4.example')).toBe('https://n4.example/c/abc');
  });
});
