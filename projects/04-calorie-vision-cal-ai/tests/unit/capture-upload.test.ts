// `uploadCapture` — соединяет кнопку съёмки с `POST /api/v1/scans` (задача N4, «СОЕДИНИТЬ
// кнопку съёмки с приёмом фото»). Сеть перехвачена ЦЕЛИКОМ, как в `provider-openrouter.test.ts`
// (`testing.md`: «тесты не ходят в интернет») — jsdom не настроен, DOM/canvas здесь не нужны:
// модуль решает, ЧТО отправить и как разобрать ответ, без браузера.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadCapture } from '../../apps/web/app/capture-upload.js';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fakeBlob(): Blob {
  return new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('202: успешный приём', () => {
  it('возвращает scan_id из тела и отправляет multipart с полем photo и заголовком Idempotency-Key', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse({ data: { scan_id: 'scan-1', status: 'queued' } }, 202));
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await uploadCapture(fakeBlob());

    expect(outcome).toEqual({ kind: 'queued', scanId: 'scan-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/scans');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('photo')).toBeInstanceOf(Blob);
  });
});

describe('401: сессии нет — один повтор с тем же ключом повторности', () => {
  it('создаёт сессию и повторяет ОДИН раз с ТЕМ ЖЕ Idempotency-Key', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url === '/api/v1/auth/device') return jsonResponse({ data: { status: 'created' } }, 201);
      if (calls.filter((c) => c.url === '/api/v1/scans').length === 1) return jsonResponse({ error: { code: 'unauthenticated', message: 'сессия отсутствует' } }, 401);
      return jsonResponse({ data: { scan_id: 'scan-2', status: 'queued' } }, 202);
    });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await uploadCapture(fakeBlob());

    expect(outcome).toEqual({ kind: 'queued', scanId: 'scan-2' });
    const scanCalls = calls.filter((c) => c.url === '/api/v1/scans');
    expect(scanCalls).toHaveLength(2); // РОВНО один повтор — не ноль, не два
    const key1 = (scanCalls[0]?.init.headers as Record<string, string>)['Idempotency-Key'];
    const key2 = (scanCalls[1]?.init.headers as Record<string, string>)['Idempotency-Key'];
    expect(key1).toBe(key2); // ТОТ ЖЕ ключ — продолжение попытки, не вторая заявка
    expect(calls.some((c) => c.url === '/api/v1/auth/device')).toBe(true);
  });

  it('генерирует ключ повторности ОДИН раз на отправку, а не на каждый сетевой запрос', async () => {
    // Мутация-испытание стража: если бы `crypto.randomUUID()` вызывался внутри `postScan`
    // (то есть на КАЖДЫЙ HTTP-запрос), ключи первой и второй попытки разошлись бы — ровно
    // проверка выше это уже ловит; здесь фиксируем счётчик вызовов randomUUID отдельно.
    const spy = vi.spyOn(crypto, 'randomUUID');
    let scanAttempts = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/v1/auth/device') return jsonResponse({ data: { status: 'created' } }, 201);
      scanAttempts += 1;
      if (scanAttempts === 1) return jsonResponse({ error: { code: 'unauthenticated' } }, 401);
      return jsonResponse({ data: { scan_id: 'scan-3', status: 'queued' } }, 202);
    });
    vi.stubGlobal('fetch', fetchMock);

    await uploadCapture(fakeBlob());

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('второй 401 подряд НЕ пытается повторить ещё раз', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/v1/auth/device') return jsonResponse({ data: { status: 'existing' } }, 200);
      return jsonResponse({ error: { code: 'unauthenticated' } }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await uploadCapture(fakeBlob());

    expect(outcome.kind).toBe('error');
    const scanCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/v1/scans');
    expect(scanCalls).toHaveLength(2); // не 3 — больше одного повтора не делать
  });
});

describe('429: лимит — сырые scope/reset_at, без форматирования', () => {
  it('отдаёт scope и reset_at ИЗ ТЕЛА без изменений', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { code: 'quota_exhausted', message: 'потолок исчерпан', details: { scope: 'user', reset_at: '2026-09-14T00:00:00.000Z' } } }, 429)),
    );

    const outcome = await uploadCapture(fakeBlob());

    expect(outcome).toEqual({ kind: 'limit', scope: 'user', resetAt: '2026-09-14T00:00:00.000Z' });
  });
});

describe('413/422/400: отклонение с названной причиной', () => {
  it.each([
    [413, 'file_too_large', 'слишком большое'],
    [422, 'invalid_image', 'не похож на фото'],
    [422, 'decompression_bomb', 'разрешение'],
    [422, 'image_too_small', 'маленькое'],
    [400, 'idempotency_key_required', 'попробуйте ещё раз'],
  ])('%s %s даёт сообщение, содержащее «%s», а не общее «что-то пошло не так»', async (status, code, fragment) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code, message: 'тест' } }, status)));

    const outcome = await uploadCapture(fakeBlob());

    expect(outcome.kind).toBe('rejected');
    expect((outcome as { message: string }).message.toLowerCase()).toContain(fragment);
    expect((outcome as { message: string }).message.toLowerCase()).not.toBe('что-то пошло не так');
  });

  it('неопознанный код отклонения — самое общее сообщение, не молчание', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code: 'совсем_новый_код', message: 'тест' } }, 422)));

    const outcome = await uploadCapture(fakeBlob());

    expect(outcome.kind).toBe('rejected');
    expect((outcome as { message: string }).message.length).toBeGreaterThan(0);
  });
});

describe('сетевой сбой — тоже названное состояние', () => {
  it('fetch, отклонивший промис, даёт kind: error, а не необработанное исключение', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('fetch failed: ECONNREFUSED'))));

    const outcome = await uploadCapture(fakeBlob());

    expect(outcome.kind).toBe('error');
    expect((outcome as { message: string }).message.length).toBeGreaterThan(0);
  });
});

describe('неожиданный статус', () => {
  it('не входящий в контракт код тоже даёт названное состояние error, а не бросает', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 500)));

    const outcome = await uploadCapture(fakeBlob());

    expect(outcome.kind).toBe('error');
  });
});
