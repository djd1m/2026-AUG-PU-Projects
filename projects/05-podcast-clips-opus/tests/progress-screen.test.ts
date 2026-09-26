import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Pool } from 'pg';
import { presentVideo, presentClip, failedStageOf, type VideoRow, type ClipRow, ScreenService } from '../apps/web/src/server/screen';
import { ribbonOf } from '../apps/web/src/lib/progress-ribbon';
import { ProgressPanel } from '../apps/web/src/app/videos/[videoId]/VideoDetail';
import { ClipCard } from '../apps/web/src/app/clips/ClipCard';
import { createClipFileHandler } from '../apps/web/src/server/clip-file';
import { VIDEO_FAILURE_REASON, VIDEO_STATUS } from '../packages/shared/src/enums';
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
// Фича 29 progress-ribbon: лента стадий. Заголовки describe/it — цели мутаций scripts/test-progress-mutations.mjs.
const views = (row: VideoRow) => ribbonOf(presentVideo(row, now)).steps.map(step => step.view);
const text = (html: string) => html.replace(/<[^>]+>/g, '');
describe('лента стадий экрана записи', () => {
  it('лента: каждый статус канона даёт свою стадию и вид', () => {
    const expected: Record<string, string[]> = {
      uploading: ['running', 'pending', 'pending', 'pending'], queued: ['running', 'pending', 'pending', 'pending'],
      transcribing: ['done', 'running', 'pending', 'pending'], selecting: ['done', 'done', 'running', 'pending'],
      rendering: ['done', 'done', 'done', 'running'], done: ['done', 'done', 'done', 'done'],
      failed: ['failed', 'pending', 'pending', 'pending'],
    };
    for (const status of VIDEO_STATUS) expect(views({ ...video, status }), status).toEqual(expected[status]);
    expect(ribbonOf(presentVideo(video, now)).steps.map(step => step.label)).toEqual(['Загрузка', 'Расшифровка', 'Выбор', 'Монтаж']);
    // «N из M» — только у идущего Монтажа.
    expect(ribbonOf(presentVideo(video, now)).steps.map(step => step.detail)).toEqual([null, null, null, '1 из 2']);
    expect(ribbonOf(presentVideo({ ...video, status: 'selecting' }, now)).steps.every(step => step.detail === null)).toBe(true);
    const html = markup(video);
    expect(html).toContain('<ol class="progress-ribbon" aria-label="Этапы обработки">');
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="step"[^>]*>.*?Монтаж.*?1 из 2.*? — идёт/);
    for (const state of ['сделано', 'идёт']) expect(html).toContain(` — ${state}`);
    // Место на диске кончилось: задача жива, стадия та же, текст говорит, чего ждём.
    const waiting = presentVideo({ ...video, wait_reason: 'no_disk' }, now);
    expect(ribbonOf(waiting).steps[3]!.view).toBe('running'); expect(markup({ ...video, wait_reason: 'no_disk' })).toContain('Ждём свободного места');
  });
  it('лента: молчание пять минут — «нет ответа», а не «идёт»', () => {
    const stale = { ...video, updated_at: new Date(now.getTime() - 300001) };
    expect(views(stale)).toEqual(['done', 'done', 'done', 'silent']);
    const html = markup(stale);
    expect(html).toContain('data-view="silent"'); expect(html).not.toContain('data-view="running"');
    expect(html).toContain(' — нет ответа'); expect(html).not.toContain(' — идёт');
    // Граница: ровно 5 минут — ещё «идёт».
    expect(views({ ...video, updated_at: new Date(now.getTime() - 300000) })).toEqual(['done', 'done', 'done', 'running']);
    // Локальные часы экрана (сеть пропала) дают тот же вид.
    expect(ribbonOf({ ...presentVideo(video, now), no_response: true }).steps[3]!.view).toBe('silent');
  });
  it('лента: стадия отказа — из последней попытки', () => {
    const failed = { ...video, status: 'failed' as const, failure_reason: 'stalled' as const };
    expect(views(failed)).toEqual(['failed', 'pending', 'pending', 'pending']);
    expect(views({ ...failed, last_stage: 'stt', last_stage_status: 'failed' })).toEqual(['done', 'failed', 'pending', 'pending']);
    expect(views({ ...failed, last_stage: 'select', last_stage_status: 'failed' })).toEqual(['done', 'done', 'failed', 'pending']);
    expect(views({ ...failed, last_stage: 'render', last_stage_status: 'running' })).toEqual(['done', 'done', 'done', 'failed']);
    // Успешная последняя попытка: отказ случился на СЛЕДУЮЩЕЙ стадии до её первой попытки.
    expect(failedStageOf({ last_stage: 'stt', last_stage_status: 'succeeded' })).toBe('select');
    expect(failedStageOf({ last_stage: 'select', last_stage_status: 'succeeded' })).toBe('render');
    // Не из закрытого набора / нет попыток — «Загрузка».
    for (const last_stage of [null, undefined, '', 'STT', 'probe']) expect(failedStageOf({ last_stage, last_stage_status: 'failed' })).toBe('upload');
    expect(presentVideo({ ...video, last_stage: 'stt', last_stage_status: 'failed' }, now).failed_stage).toBeNull();
    const html = markup({ ...failed, last_stage: 'select', last_stage_status: 'failed' });
    expect(html).toMatch(/data-view="failed" aria-current="step">.*?Выбор.*? — отказ/);
    expect(html).toContain('Обработка перестала отвечать.'); expect(html).toContain('Повторить');
  });
  it('лента: готово — одна строка «Клипы готовы · N из M»', () => {
    const html = markup({ ...video, status: 'done', clips_done: 3, clips_total: 4 });
    expect(html).not.toContain('<ol'); expect(html).not.toContain('<progress'); expect(html).not.toContain('<h2');
    expect(text(html)).toContain('Клипы готовы · 3 из 4'); expect(html).toContain('status-panel success compact');
  });
  it('лента: SQL берёт стадию последней попытки без пересборок', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ...video, status: 'failed', failure_reason: 'stalled', last_stage: 'select', last_stage_status: 'failed' }] });
    const screen = await new ScreenService({ query } as unknown as Pool, () => now).get('owner', id);
    expect(screen.failed_stage).toBe('select');
    const sql = String(query.mock.calls[0]?.[0]).replace(/\s+/g, ' ');
    expect(sql).toContain('LEFT JOIN LATERAL (SELECT j.stage, j.status FROM job_attempt j WHERE j.video_id=v.id AND NOT j.rerender ORDER BY j.fence DESC LIMIT 1) last ON true');
  });
});
describe('авторизованный redirect файла и превью', () => {
  const row = { status: 'done', object_key: 'clips/free/file.mp4', thumbnail_key: 'thumb.jpg', title: 'Имя; выпуска', expires_at: null, finished_at: null, plan: 'free' };
  function fixture(rows: object[] = [row]) {
    const query = vi.fn().mockResolvedValue({ rows });
    const auth = { authenticate: vi.fn().mockResolvedValue({ account_id: 'owner' }) };
    const sign = vi.fn().mockResolvedValue('https://storage.example/file?signed=true');
    const deps = { pool: { query } as unknown as Pick<Pool, 'query'>, auth, sign, clock: () => now };
    const request = new Request(`https://app.example/api/clips/${id}/file?download=1`, { headers: { 'x-forwarded-for': '192.0.2.1, 127.0.0.1', cookie: `__Host-n5_session=${'a'.repeat(43)}`, 'x-user-id': 'attacker' } });
    return { query, auth, sign, deps, request };
  }
  it('чужой и отсутствующий клип дают один 404, не 403; фильтр по владельцу из сессии', async () => {
    const f = fixture([]); const handler = createClipFileHandler({ ...f.deps, allowRead: async () => true, trustedProxyHops: 1 });
    const foreign = await handler(f.request, id), absent = await handler(f.request, '00000000-0000-4000-8000-000000000002');
    expect(foreign.status).toBe(404); expect(absent.status).toBe(404); expect(await foreign.text()).toBe(await absent.text());
    expect(f.query.mock.calls[0]?.[0]).toContain('v.account_id=$2'); expect(f.query.mock.calls[0]?.[1]).toEqual([id, 'owner', null, now]);
    expect(f.sign).not.toHaveBeenCalled();
  });
  it('клип не done даёт 404, соседний готовый отдаётся', async () => {
    const f = fixture(); const handler = createClipFileHandler({ ...f.deps, allowRead: async () => true, trustedProxyHops: 1 });
    for (const status of ['queued', 'rendering', 'failed']) {
      f.query.mockResolvedValueOnce({ rows: [{ ...row, status }] }); expect((await handler(f.request, id)).status).toBe(404);
    }
    expect(f.sign).not.toHaveBeenCalled();
    const response = await handler(f.request, id); expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://storage.example/file?signed=true');
    expect(f.sign).toHaveBeenCalledWith('clips/free/file.mp4', 'Имя выпуска.mp4');
    expect(response.headers.get('cache-control')).toContain('no-store');
    const thumbnail = await createClipFileHandler({ ...f.deps, allowRead: async () => true, trustedProxyHops: 1 }, 'thumbnail')(f.request, id);
    expect(thumbnail.status).toBe(302); expect(f.sign).toHaveBeenLastCalledWith('thumb.jpg', undefined);
  });
  it('нет сессии / плохой id / истечение / нет ключа — без подписи; ошибка хранилища видима', async () => {
    const f = fixture(); const handler = createClipFileHandler({ ...f.deps, allowRead: async () => true, trustedProxyHops: 1 });
    expect((await handler(new Request(f.request.url, { headers: { 'x-forwarded-for': '192.0.2.1, 127.0.0.1' } }), id)).status).toBe(404);
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

it('actual clip duration is numeric in screen and used by ClipCard; null falls back', () => {
  const screen = presentClip({ ...clip, duration_seconds: '20.12' }, video, now);
  expect(screen.duration_seconds).toBe(20.12);
  expect(renderToStaticMarkup(createElement(ClipCard, { clip: screen }))).toContain('20.1');
  expect(renderToStaticMarkup(createElement(ClipCard, { clip: { ...screen, duration_seconds: null } }))).toContain('23.0');
});
