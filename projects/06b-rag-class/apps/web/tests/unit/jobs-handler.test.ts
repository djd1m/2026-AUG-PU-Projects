import { describe, expect, it } from 'vitest';
import { normalizeSiteUrl, type Pool } from '@n6b/db';
import { createJobHandler, createRetryHandler, createSourceHandler, type JobsDeps } from '@/server/jobs-handler';
import { type JobPayload, jobScreen, plural } from '@/lib/job-view';

// Ручки задачи до базы данных: порядок отказов (Origin → сессия → идентификатор → тело) и то, что ни один отказ не
// доходит до пула. Пул-ловушка бросает на любом обращении: отказ, дошедший до БД, — красный тест.
const BASE = 'https://n6b.example.test';
const TOKEN = 'a'.repeat(43);
const BOT = '6f1c2d3e-4a5b-4c6d-8e7f-001122334455';
const trap = new Proxy({}, { get() { throw new Error('пул тронут до проверки'); } }) as Pool;
const deps = (account: string | null = 'acc'): JobsDeps => ({ tenantPool: trap, publicBaseUrl: BASE, log: () => undefined,
  authenticate: async () => account });
const req = (opts: { origin?: string | null; cookie?: boolean; body?: string; type?: string } = {}) =>
  new Request(`${BASE}/api/x`, { method: 'POST', body: opts.body ?? JSON.stringify({ url: 'https://example.ru' }),
    headers: { ...(opts.origin === null ? {} : { origin: opts.origin ?? BASE }),
      ...(opts.cookie === false ? {} : { cookie: `n6b_session=${TOKEN}` }),
      'content-type': opts.type ?? 'application/json' } });

describe('POST /api/bots/{id}/sources — отказы до БД', () => {
  const post = createSourceHandler(deps());
  it('чужой Origin и отсутствующий Origin → 403', async () => {
    expect((await post(req({ origin: 'https://evil.example' }), BOT)).status).toBe(403);
    expect((await post(req({ origin: null }), BOT)).status).toBe(403);
  });
  it('без сессии → 401; сессия не найдена → 401', async () => {
    expect((await post(req({ cookie: false }), BOT)).status).toBe(401);
    expect((await createSourceHandler(deps(null))(req(), BOT)).status).toBe(401);
  });
  it('идентификатор бота не uuid → 404', async () => {
    for (const id of ['1', "x' OR 1=1", '', `${BOT}0`]) expect((await post(req(), id)).status, id).toBe(404);
  });
  it('непригодный URL → 422', async () => {
    for (const url of ['ftp://example.ru', 'javascript:alert(1)', 'https://u:p@example.ru', 'https://example.ru:8080/',
      'example.ru', '', `https://example.ru/${'a'.repeat(2100)}`]) {
      expect((await post(req({ body: JSON.stringify({ url }) }), BOT)).status, url).toBe(422);
    }
    expect((await post(req({ body: '{', type: 'application/json' }), BOT)).status).toBe(422);
    expect((await post(req({ type: 'text/plain' }), BOT)).status).toBe(422);
    expect((await post(req({ body: JSON.stringify({ url: 5 }) }), BOT)).status).toBe(422);
  });
});

describe('GET и retry задачи — отказы до БД', () => {
  it('GET без сессии → 401, не uuid → 404; retry с чужим Origin → 403', async () => {
    const get = createJobHandler(deps());
    expect((await get(new Request(`${BASE}/api/jobs/x`), BOT)).status).toBe(401);
    expect((await get(new Request(`${BASE}/api/jobs/x`, { headers: { cookie: `n6b_session=${TOKEN}` } }), 'x')).status).toBe(404);
    expect((await createRetryHandler(deps())(req({ origin: 'https://evil.example' }), BOT)).status).toBe(403);
  });
});

describe('normalizeSiteUrl — «тот же источник»', () => {
  it('фрагмент отрезается, регистр хоста и порт по умолчанию нормализуются', () => {
    expect(normalizeSiteUrl('https://Example.RU/a#x')).toBe('https://example.ru/a');
    expect(normalizeSiteUrl(' https://example.ru:443/a#y ')).toBe('https://example.ru/a');
    expect(normalizeSiteUrl('http://example.ru:80')).toBe('http://example.ru/');
    expect(normalizeSiteUrl('http://example.ru:443/')).toBe('http://example.ru:443/');
  });
});

describe('экран задачи: три состояния различимы (SC-US-004-1…3)', () => {
  const base: JobPayload = { job_id: 'j', state: 'running', progress_done: 12, progress_total: 40, fragments: 312,
    error: null, note: null };
  it('выполняется / готово / ошибка — три разных заголовка, действия и признака «жива»', () => {
    const running = jobScreen(base);
    const done = jobScreen({ ...base, state: 'succeeded', progress_done: 40 });
    const failed = jobScreen({ ...base, state: 'failed', error: 'robots.txt недоступен' });
    expect(running).toMatchObject({ kind: 'running', live: true, action: null, title: 'Индексация: страниц 12 из 40' });
    expect(done).toMatchObject({ kind: 'succeeded', live: false, title: 'Готово: 40 страниц, 312 фрагментов',
      action: { kind: 'sandbox', label: 'Спросить в песочнице' } });
    expect(failed).toMatchObject({ kind: 'failed', live: false, title: 'Не удалось: robots.txt недоступен',
      action: { kind: 'retry', label: 'Повторить' } });
    expect(new Set([running.title, done.title, failed.title]).size).toBe(3);
    expect(jobScreen({ ...base, progress_total: null }).title).toBe('Индексация: страниц 12, всего пока неизвестно');
  });
  it('неизвестное состояние — не «готово» и не вечный прогресс', () => {
    for (const state of ['queued', 'done', 'SUCCEEDED', null, undefined, 1]) {
      const s = jobScreen({ ...base, state });
      expect(s.kind, String(state)).toBe('failed');
      expect(s.live).toBe(false);
      expect(s.action).toBeNull();
    }
  });
});

describe('склонение на экране «Готово» (08_review.md F-6)', () => {
  it('0, 1, 2, 5, 11, 21, 22, 25, 111 — форма слова по-русски', () => {
    const forms: Record<number, string> = { 0: 'страниц', 1: 'страница', 2: 'страницы', 5: 'страниц', 11: 'страниц',
      21: 'страница', 22: 'страницы', 25: 'страниц', 111: 'страниц', 12: 'страниц', 14: 'страниц', 104: 'страницы' };
    for (const [n, word] of Object.entries(forms)) {
      expect(plural(Number(n), 'страница', 'страницы', 'страниц'), n).toBe(word);
    }
  });
  it('заголовок «Готово» согласован: 2 страницы, 1 фрагмент; 21 страница, 22 фрагмента', () => {
    const base: JobPayload = { job_id: 'j', state: 'succeeded', progress_done: 2, progress_total: 2, fragments: 1,
      error: null, note: null };
    expect(jobScreen(base).title).toBe('Готово: 2 страницы, 1 фрагмент');
    expect(jobScreen({ ...base, progress_done: 21, fragments: 22 }).title).toBe('Готово: 21 страница, 22 фрагмента');
    expect(jobScreen({ ...base, progress_done: 0, fragments: 0 }).title).toBe('Готово: 0 страниц, 0 фрагментов');
  });
  it('нецелое или отрицательное число — отказ, а не правдоподобная форма', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => plural(bad, 'a', 'b', 'c'), String(bad)).toThrow(/склонение/);
    }
  });
});
