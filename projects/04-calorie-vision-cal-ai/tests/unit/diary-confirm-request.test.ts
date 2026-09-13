// `buildDiaryConfirmRequest`/`parseDiaryConfirmResponse` (задача N4, «в дневник»). Проверяет
// запрос `PATCH /diary/{entryId}` и разбор всех кодов, названных сервером
// (`apps/api/src/routes/diary.ts`): 200/403/404/409/неопознанный.

import { describe, expect, it } from 'vitest';
import { buildDiaryConfirmRequest, parseDiaryConfirmResponse } from '../../apps/web/app/result/diary-confirm-request';

const SCAN_ID = 'scan-abc';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('buildDiaryConfirmRequest', () => {
  it('PATCH /api/v1/diary/{entryId} с телом { op: "confirm" }, entryId = recognition_id', () => {
    const { url, init } = buildDiaryConfirmRequest(SCAN_ID);
    expect(url).toBe(`/api/v1/diary/${SCAN_ID}`);
    expect(init.method).toBe('PATCH');
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body as string)).toEqual({ op: 'confirm' });
  });
});

describe('parseDiaryConfirmResponse', () => {
  it('200 -> confirmed', async () => {
    expect(await parseDiaryConfirmResponse(jsonResponse({ data: {} }, 200))).toEqual({ kind: 'confirmed' });
  });

  it('403 consent_required -> consent_required', async () => {
    expect(await parseDiaryConfirmResponse(jsonResponse({ error: { code: 'consent_required' } }, 403))).toEqual({ kind: 'consent_required' });
  });

  it('404 not_found -> not_found', async () => {
    expect(await parseDiaryConfirmResponse(jsonResponse({ error: { code: 'not_found' } }, 404))).toEqual({ kind: 'not_found' });
  });

  it('409 not_done -> not_done с failure_reason из details', async () => {
    const body = { error: { code: 'not_done', message: 'скан ещё не в статусе done', details: { failure_reason: 'low_confidence' } } };
    expect(await parseDiaryConfirmResponse(jsonResponse(body, 409))).toEqual({ kind: 'not_done', failureReason: 'low_confidence' });
  });

  it('409 без failure_reason в теле -> not_done с null, а не выброшенным исключением', async () => {
    expect(await parseDiaryConfirmResponse(jsonResponse({ error: { code: 'not_done' } }, 409))).toEqual({ kind: 'not_done', failureReason: null });
  });

  it('неопознанный код -> error с сообщением, а не тихий успех (fail-closed-defaults)', async () => {
    const outcome = await parseDiaryConfirmResponse(jsonResponse({}, 500));
    expect(outcome.kind).toBe('error');
  });
});
