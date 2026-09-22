import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Pool } from 'pg';
import { presentVideo, presentClip, type VideoRow, type ClipRow, ScreenService } from '../apps/web/src/server/screen';
import { ProgressPanel } from '../apps/web/src/app/videos/[videoId]/VideoDetail';
import { ClipCard } from '../apps/web/src/app/clips/ClipCard';
import { createClipFileHandler } from '../apps/web/src/server/clip-file';
import { VIDEO_FAILURE_REASON } from '../packages/shared/src/enums';
import { appRouter } from '../apps/web/src/server/trpc';
import { startClipDownload } from '../apps/web/src/app/clips/useClipDownload';
import * as rpcClient from '../apps/web/src/lib/rpc';
import { allowRead, allowMutation } from '../apps/web/src/server/rate-limit';
import type Redis from 'ioredis';
import { createS3Client, generateDownloadUrl } from '../packages/s3/src';
import { loadWebConfig } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
const now = new Date('2026-09-22T12:00:00Z');
const id = '00000000-0000-4000-8000-000000000001';
export const video: VideoRow = { id, status: 'rendering', created_at: now, updated_at: now, finished_at: null,
  duration_seconds: '600', stage_progress: 40, clips_done: 1, clips_total: 2, failure_reason: null,
  object_key: 'source', actual_bytes: '100', plan: 'free', wait_reason: null };
const clip: ClipRow = { id, index: 1, start_seconds: '2', end_seconds: '25', title: 'Сильный момент', status: 'done',
  watermarked: true, object_key: 'file', expires_at: null, score: 60, score_hook: 20, score_completeness: 20, score_length: 20,
  explain_hook: 'Вопрос с первых слов', explain_completeness: 'Есть законченный ответ', explain_length: 'Нет лишних слов' };
const markup = (row: VideoRow) => renderToStaticMarkup(createElement(ProgressPanel, { video: presentVideo(row, now) }));
describe('экран прогресса и оценки', () => {
  it('три состояния различимы в HTML и тексте', () => {
    const running = markup(video), success = markup({ ...video, status: 'done' }), failed = markup({ ...video, status: 'failed', failure_reason: 'render_failed' });
    expect(running).toContain('data-state="running"'); expect(running).toContain('Выполняется');
    expect(success).toContain('data-state="success"'); expect(success).toContain('Клипы готовы');
    expect(failed).toContain('data-state="failure"'); expect(failed).toContain('Обработка не завершена');
    expect(failed).toContain('Повторить'); expect(failed).not.toContain('<progress');
  });
  it('молчание после пяти минут не показывается как идёт', () => {
    const stale = { ...video, updated_at: new Date(now.getTime() - 300001) };
    expect(presentVideo(stale, now).no_response).toBe(true);
    expect(markup(stale)).toContain('data-state="silent"'); expect(markup(stale)).toContain('Нет ответа от обработки');
    expect(markup(stale)).not.toContain('Выполняется'); expect(markup(stale)).not.toContain('<progress');
    expect(presentVideo({ ...stale, updated_at: new Date(now.getTime() - 300000) }, now).no_response).toBe(false);
    expect(presentVideo({ ...stale, status: 'done' }, now).no_response).toBe(false);
  });
  it('все причины имеют человеческий текст; незаконный retry скрыт', () => {
    for (const failure_reason of VIDEO_FAILURE_REASON) {
      expect(presentVideo({ ...video, status: 'failed', failure_reason }, now).failure_reason?.length).toBeGreaterThan(10);
    }
    expect(presentVideo({ ...video, status: 'failed', failure_reason: 'no_audio' }, now).next_action).toBe('upload');
    expect(presentVideo({ ...video, status: 'failed', failure_reason: 'refused_user_uploads' }, now).next_action).toBe('tomorrow');
    expect(presentVideo({ ...video, status: 'failed', object_key: null }, now).next_action).toBe('upload');
    const refusal = presentVideo({ ...video, status: 'failed', failure_reason: 'refused_user_minutes' }, now);
    expect(refusal.retry_after).toBe('2026-09-22T21:00:00.000Z');
    expect(presentVideo({ ...video, status: 'failed', failure_reason: 'refused_user_minutes' }, new Date('2026-09-23T12:00:00Z')).retry_after).toBe(refusal.retry_after);
    expect(presentVideo({ ...video, wait_reason: 'no_disk' }, now).stage_label).toBe('Ждём свободного места');
  });
  it('пустое объяснение оценки отвергается, null score не становится нулём', () => {
    for (const field of ['explain_hook', 'explain_completeness', 'explain_length']) {
      for (const value of ['', '   ', null]) expect(() => presentClip({ ...clip, [field]: value }, video, now)).toThrow();
    }
    expect(presentClip({ ...clip, score: null }, video, now)).not.toHaveProperty('score');
    expect(presentClip({ ...clip, score: null }, video, now)).not.toHaveProperty('explanations');
    expect(() => presentClip({ ...clip, score: 99 }, video, now)).toThrow();
    const html = renderToStaticMarkup(createElement(ClipCard, { clip: presentClip(clip, video, now) }));
    for (const text of ['Цепкость', 'Самодостаточность', 'Длина', 'Вопрос с первых слов', 'Есть законченный ответ', 'Нет лишних слов']) expect(html).toContain(text);
  });
  it('срок бесплатного файла считается с первого дня, истёкший нельзя скачать', () => {
    const finished_at = new Date(now.getTime() - 4 * 86400000);
    const expired = presentClip(clip, { plan: 'free', finished_at }, now);
    expect(expired.available).toBe(false); expect(expired.expires_at).not.toBeNull();
    expect(presentClip(clip, { plan: 'paid', finished_at }, now).available).toBe(true);
  });
});
describe('авторизованный redirect файла и превью', () => {
  const row = { status: 'done', object_key: 'clips/free/file.mp4', thumbnail_key: 'thumb.jpg', title: 'Имя; выпуска', expires_at: null, finished_at: null, plan: 'free' };
  function fixture(rows: object[] = [row]) {
    const query = vi.fn().mockResolvedValue({ rows });
    const auth = { authenticate: vi.fn().mockResolvedValue({ account_id: 'owner' }) };
    const sign = vi.fn().mockResolvedValue('https://storage.example/file?signed=true');
    const deps = { pool: { query } as unknown as Pick<Pool, 'query'>, auth, sign, clock: () => now };
    const request = new Request(`https://app.example/api/clips/${id}/file?download=1`, { headers: { cookie: `__Host-n5_session=${'a'.repeat(43)}`, 'x-user-id': 'attacker' } });
    return { query, auth, sign, deps, request };
  }
  it('чужой и отсутствующий клип дают один 404, не 403; фильтр по владельцу из сессии', async () => {
    const f = fixture([]); const handler = createClipFileHandler(f.deps);
    const foreign = await handler(f.request, id), absent = await handler(f.request, '00000000-0000-4000-8000-000000000002');
    expect(foreign.status).toBe(404); expect(absent.status).toBe(404); expect(await foreign.text()).toBe(await absent.text());
    expect(f.query.mock.calls[0]?.[0]).toContain('v.account_id=$2'); expect(f.query.mock.calls[0]?.[1]).toEqual([id, 'owner']);
    expect(f.sign).not.toHaveBeenCalled();
  });
  it('клип не done даёт 404, соседний готовый отдаётся', async () => {
    const f = fixture(); const handler = createClipFileHandler(f.deps);
    for (const status of ['queued', 'rendering', 'failed']) {
      f.query.mockResolvedValueOnce({ rows: [{ ...row, status }] }); expect((await handler(f.request, id)).status).toBe(404);
    }
    expect(f.sign).not.toHaveBeenCalled();
    const response = await handler(f.request, id); expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://storage.example/file?signed=true');
    expect(f.sign).toHaveBeenCalledWith('clips/free/file.mp4', 'Имя выпуска.mp4');
    expect(response.headers.get('cache-control')).toContain('no-store');
    const thumbnail = await createClipFileHandler(f.deps, 'thumbnail')(f.request, id);
    expect(thumbnail.status).toBe(302); expect(f.sign).toHaveBeenLastCalledWith('thumb.jpg', undefined);
  });
  it('нет сессии / плохой id / истечение / нет ключа — без подписи; ошибка хранилища видима', async () => {
    const f = fixture(); const handler = createClipFileHandler(f.deps);
    expect((await handler(new Request(f.request.url), id)).status).toBe(404);
    expect((await handler(f.request, 'bad')).status).toBe(404); expect(f.query).not.toHaveBeenCalled();
    f.query.mockResolvedValueOnce({ rows: [{ ...row, expires_at: now }] }); expect((await handler(f.request, id)).status).toBe(404);
    f.query.mockResolvedValueOnce({ rows: [{ ...row, object_key: null }] }); expect((await handler(f.request, id)).status).toBe(404);
    expect(f.sign).not.toHaveBeenCalled(); f.sign.mockRejectedValueOnce(new Error('private details'));
    const failed = await handler(f.request, id); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain('private details');
  });
});
describe('tRPC read contract', () => {
  it('GET video.get passes canonical input and ownership into service; result wrapper matches client', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [video] });
    const response = await fetchRequestHandler({ endpoint: '/api/trpc',
      req: new Request(`https://app.example/api/trpc/video.get?input=${encodeURIComponent(JSON.stringify({ video_id: id }))}`),
      router: appRouter, createContext: () => ({ account: 'owner', idempotencyKey: null, requestId: 'test',
        video: { create: vi.fn() }, screen: new ScreenService({ query } as unknown as Pool, () => now) }) });
    expect(response.status).toBe(200); expect((await response.json()).result.data.data.video_id).toBe(id);
    expect(query.mock.calls[0]?.[1]).toEqual(['owner', id]);
  });
});

it('чтения 120/мин отдельно от 30 мутаций', async () => {
  const counts = new Map<string, number>();
  const redis = { status: 'ready', eval: vi.fn(async (_script, _count, key: string) => {
    const next = (counts.get(key) ?? 0) + 1; counts.set(key, next); return next;
  }) } as unknown as Redis;
  const reads = await Promise.all(Array.from({ length: 121 }, () => allowRead(redis, '203.0.113.5', 'test-key', 'owner')));
  expect(reads.filter(Boolean)).toHaveLength(120);
  expect(await allowMutation(redis, '203.0.113.5', 'test-key', 'owner')).toBe(true);
});
it('скачивание: UTF-8 имя в подписанном Content-Disposition, TTL 900', async () => {
  const config = loadWebConfig(environment()).s3, client = createS3Client(config);
  try {
    const url = new URL(await generateDownloadUrl({ client, bucket: config.bucket }, 'clip.mp4', 'Мой выпуск.mp4'));
    expect(url.searchParams.get('response-content-disposition')).toContain("filename*=UTF-8''%D0");
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
  } finally { client.destroy(); }
});

it('файл открывается сразу, даже если запись события не отвечает', () => {
  const anchor = { href: '', download: '', rel: '', click: vi.fn(), remove: vi.fn() };
  const analytics = vi.spyOn(rpcClient, 'rpc').mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal('document', { createElement: () => anchor, body: { appendChild: vi.fn() } });
  try {
    startClipDownload(id, 'Мой клип');
    expect(anchor.click).toHaveBeenCalledOnce(); expect(anchor.href).toBe(`/api/clips/${id}/file?download=1`);
    expect(anchor.click.mock.invocationCallOrder[0]).toBeLessThan(analytics.mock.invocationCallOrder[0]!);
  } finally { vi.unstubAllGlobals(); analytics.mockRestore(); }
});
