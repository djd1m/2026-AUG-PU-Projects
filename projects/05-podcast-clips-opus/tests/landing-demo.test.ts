// Фича 28 landing-demo (ADR-018): закрытый набор витрины, третий путь к файлу клипа, ретенция, /c/ и разметка лендинга.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Pool } from 'pg';
import { SHOWCASE_CLIPS, SHOWCASE_CLIP_IDS, findShowcase, isShowcaseClip, showcaseCaption } from '../packages/shared/src/showcase';
import { createShowcaseFileHandler } from '../apps/web/src/server/showcase-file';
import { retentionTick } from '../apps/web/src/server/retention';
import { previewState, type ShortLink } from '../apps/web/src/server/short-link';
import { createS3Client, generateDownloadUrl } from '../packages/s3/src';
import { loadWebConfig } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
import { LandingDemo } from '../apps/web/src/app/LandingDemo';
import { Landing } from '../apps/web/src/app/Landing';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const SHOWCASE = SHOWCASE_CLIPS[0]!;
const request = (ip = '203.0.113.7') => new Request('https://clipmkr.ru/api/showcase/x/file', { headers: { 'x-forwarded-for': `${ip}, 127.0.0.1` } });
function setup(rows: object[] = [{ object_key: 'clips/free/v/c-v2.mp4', thumbnail_key: 'thumbs/v/c.jpg' }], allowed = true) {
  const query = vi.fn(async () => ({ rows, rowCount: rows.length }));
  const allowRead = vi.fn(async () => allowed);
  const sign = vi.fn(async (key: string) => `https://storage.example/${key}?X-Amz-Expires=900`);
  const deps = { pool: { query } as unknown as Pick<Pool, 'query'>, allowRead, sign, trustedProxyHops: 1 };
  return { query, allowRead, sign, file: createShowcaseFileHandler(deps, 'file'), thumbnail: createShowcaseFileHandler(deps, 'thumbnail') };
}

describe('SHOWCASE_CLIPS — закрытый набор в коде', () => {
  it('одна запись CTDUUG; числа подписи из базы стенда: 88 мин → 7 клипов', () => {
    expect(SHOWCASE_CLIPS).toHaveLength(1);
    expect(SHOWCASE).toEqual({ code: 'CTDUUG', clipId: '46f99d89-33f5-494d-a682-2fa364c14152', sourceMinutes: 88, clipCount: 7 });
    expect(Math.round(5305.9 / 60)).toBe(SHOWCASE.sourceMinutes);
    expect(showcaseCaption(SHOWCASE)).toBe('88 мин разговора → 7 клипов');
    expect(showcaseCaption({ ...SHOWCASE, clipCount: 1 })).toBe('88 мин разговора → 1 клип');
    expect(showcaseCaption({ ...SHOWCASE, clipCount: 3 })).toBe('88 мин разговора → 3 клипа');
    expect(showcaseCaption({ ...SHOWCASE, clipCount: 12 })).toBe('88 мин разговора → 12 клипов');
    expect(SHOWCASE_CLIP_IDS).toEqual([SHOWCASE.clipId]);
    expect(Object.isFrozen(SHOWCASE_CLIPS) && Object.isFrozen(SHOWCASE)).toBe(true);
  });
  it('членство — точное совпадение кода; формат кода НЕ даёт доступа', () => {
    expect(findShowcase('CTDUUG')).toBe(SHOWCASE);
    for (const code of ['ABCDEF', 'ctduug', ' CTDUUG', 'CTDUUG ', '23456789AB', '', null, undefined, 1, ['CTDUUG'], { code: 'CTDUUG' }]) {
      expect(findShowcase(code), JSON.stringify(code)).toBeNull();
    }
    expect(isShowcaseClip(SHOWCASE.clipId)).toBe(true);
    for (const id of ['11111111-1111-4111-8111-111111111111', SHOWCASE.clipId.toUpperCase(), '', null, undefined]) expect(isShowcaseClip(id)).toBe(false);
  });
  it('набор не читается из окружения и не хранится в БД (страж по исходнику)', () => {
    const source = readFileSync('packages/shared/src/showcase.ts', 'utf8');
    expect(source).not.toMatch(/process\.env|import\s.*@clipmaker\/db/);
  });
});

describe('маршрут витрины /api/showcase/{code}/file|thumbnail — третий путь к файлу', () => {
  it('код вне набора → 404 без единого запроса к базе', async () => {
    const s = setup();
    for (const code of ['ABCDEF', 'ctduug', '23456789AB', 'CTDUUG%00']) {
      const response = await s.file(request(), code);
      expect(response.status).toBe(404);
      expect(response.headers.get('Cache-Control')).toContain('no-store');
    }
    expect(s.query).not.toHaveBeenCalled(); expect(s.sign).not.toHaveBeenCalled();
  });
  it('код витрины: запрос по id набора, только done, живой аккаунт и запись, неотозванная ссылка с ЭТИМ кодом', async () => {
    const s = setup();
    await s.file(request(), 'CTDUUG');
    const [sql, params] = s.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params).toEqual([SHOWCASE.clipId, 'CTDUUG']);
    expect(sql).toContain("c.status='done'"); expect(sql).toContain('v.deleted_at IS NULL'); expect(sql).toContain("a.status='active'");
    expect(sql).toMatch(/l\.clip_id=c\.id AND l\.code=\$2 AND l\.revoked_at IS NULL/);
  });
  it('клип не done / стёрт / чужой код → строки нет → 404; нет объекта → 404', async () => {
    expect((await setup([]).file(request(), 'CTDUUG')).status).toBe(404);
    expect((await setup([{ object_key: null, thumbnail_key: 'thumbs/x.jpg' }]).file(request(), 'CTDUUG')).status).toBe(404);
    expect((await setup([{ object_key: 'clips/x.mp4', thumbnail_key: null }]).thumbnail(request(), 'CTDUUG')).status).toBe(404);
  });
  it('успех: 302 на подписанную ссылку, без кэша и без Referer; файл и превью — свои ключи', async () => {
    const s = setup();
    const file = await s.file(request(), 'CTDUUG');
    expect(file.status).toBe(302);
    expect(file.headers.get('Location')).toBe('https://storage.example/clips/free/v/c-v2.mp4?X-Amz-Expires=900');
    expect(file.headers.get('Cache-Control')).toBe('private, no-store');
    expect(file.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(await file.text()).toBe('');
    expect((await s.thumbnail(request(), 'CTDUUG')).headers.get('Location')).toContain('thumbs/v/c.jpg');
    expect(s.sign.mock.calls.map(call => call[0])).toEqual(['clips/free/v/c-v2.mp4', 'thumbs/v/c.jpg']);
  });
  it('лимит чтений: 429 ДО базы; ключ — адрес клиента за прокси', async () => {
    const s = setup(undefined, false);
    const response = await s.file(request('198.51.100.20'), 'CTDUUG');
    expect(response.status).toBe(429);
    expect(s.allowRead).toHaveBeenCalledWith('198.51.100.20');
    expect(s.query).not.toHaveBeenCalled();
  });
  it('отказ базы → 503, не 302 и не 200', async () => {
    const s = setup(); s.query.mockRejectedValueOnce(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});
    expect((await s.file(request(), 'CTDUUG')).status).toBe(503);
  });
  it('подпись настоящим подписывателем маршрута: X-Amz-Expires ≤ 900 с', async () => {
    const config = loadWebConfig(environment()).s3, client = createS3Client(config);
    try {
      const handler = createShowcaseFileHandler({ pool: { query: vi.fn(async () => ({ rows: [{ object_key: 'clips/free/v/c.mp4', thumbnail_key: 't.jpg' }] })) } as unknown as Pick<Pool, 'query'>,
        allowRead: async () => true, trustedProxyHops: 1, sign: key => generateDownloadUrl({ client, bucket: config.bucket }, key) }, 'file');
      const location = new URL((await handler(request(), 'CTDUUG')).headers.get('Location')!);
      expect(Number(location.searchParams.get('X-Amz-Expires'))).toBeGreaterThan(0);
      expect(Number(location.searchParams.get('X-Amz-Expires'))).toBeLessThanOrEqual(900);
    } finally { client.destroy(); }
  });
  it('маршрут Next подписывает generateDownloadUrl и не проксирует байты через web', () => {
    const runtime = readFileSync('apps/web/src/server/screen-runtime.ts', 'utf8');
    const showcase = runtime.slice(runtime.indexOf('export function showcaseRoute'));
    expect(showcase).toContain('sign: key => generateDownloadUrl(ctx, key)');
    expect(showcase).not.toMatch(/stream|guestSecret/);
    for (const kind of ['file', 'thumbnail']) {
      expect(readFileSync(`apps/web/src/app/api/showcase/[code]/${kind}/route.ts`, 'utf8')).toContain(`export const GET = showcaseRoute('${kind}')`);
    }
  });
});

describe('ретенция и /c/ не хоронят клип витрины', () => {
  it('очистка клипов исключает SHOWCASE_CLIP_IDS параметром запроса', async () => {
    const calls: [string, unknown[] | undefined][] = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }], rowCount: 1 };
      if (sql.includes('SELECT count(*) FROM account')) return { rows: [{ count: '0' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const pool = { query, connect: async () => ({ query, release: vi.fn() }) } as unknown as Parameters<typeof retentionTick>[0];
    await retentionTick(pool, { delete: vi.fn(), erasePrefix: vi.fn(), eraseClipPrefix: vi.fn() }, new Date('2026-09-27T12:00:00Z'));
    const clips = calls.find(([sql]) => sql.includes('FROM clip c') && sql.includes("a.plan <> 'paid'"));
    expect(clips?.[0]).toContain('AND NOT (c.id = ANY($3::uuid[]))');
    expect(clips?.[1]?.[2]).toEqual(SHOWCASE_CLIP_IDS);
  });
  const link: ShortLink = { id: 'l', code: 'CTDUUG', clip_id: SHOWCASE.clipId, account_id: 'a', title: 't', status: 'done',
    thumbnail_key: 'thumbs/v/c.jpg', expires_at: null, finished_at: new Date('2026-09-24T10:24:31Z'), plan: 'free' };
  const later = new Date('2026-09-30T00:00:00Z');
  it('/c/ клипа витрины после 3 суток бесплатного тарифа — «ready», соседний клип той же записи — «expired»', () => {
    expect(previewState(link, later)).toBe('ready');
    expect(previewState({ ...link, clip_id: '11111111-1111-4111-8111-111111111111' }, later)).toBe('expired');
    expect(previewState({ ...link, clip_id: undefined }, later)).toBe('expired');
  });
  it('явный expires_at соблюдается и у клипа витрины', () => {
    expect(previewState({ ...link, expires_at: new Date('2026-09-29T00:00:00Z') }, later)).toBe('expired');
  });
});

describe('разметка лендинга', () => {
  it('демо: controls + playsinline + preload=none, постер и файл — только маршрут витрины, без автозвука', () => {
    const html = renderToStaticMarkup(createElement(LandingDemo));
    expect(html).toMatch(/<video[^>]*\bcontrols=""/); expect(html).toMatch(/<video[^>]*\bplaysInline=""|<video[^>]*\bplaysinline=""/);
    expect(html).toContain('preload="none"');
    expect(html).toContain('poster="/api/showcase/CTDUUG/thumbnail"'); expect(html).toContain('src="/api/showcase/CTDUUG/file"');
    expect(html).not.toMatch(/autoplay|autoPlay|muted/);
    expect(html).toContain('<strong>88 мин разговора → 7 клипов</strong>');
    expect(html).toContain('<a href="/c/CTDUUG">Открыть клип</a>');
    expect(html).not.toContain('/api/clips/');
  });
  it('пустой набор — без демо, без сломанного плеера', () => {
    expect(renderToStaticMarkup(createElement(LandingDemo, { clip: null }))).toBe('');
  });
  it('первый экран: текст владельца прежний; демо → кнопка «Попробовать бесплатно» → форма #auth с полем почты', () => {
    const html = renderToStaticMarkup(createElement(Landing, { theme: 'dark' }));
    expect(html).toContain('Хороший разговор<br/> заслуживает<br/> <em>больше зрителей.</em>');
    expect(html).toContain('ВАШИ МЫСЛИ. НОВАЯ АУДИТОРИЯ.');
    const demo = html.indexOf('class="landing-demo"'), cta = html.indexOf('class="landing-cta button" href="#auth"'), form = html.indexOf('<form id="auth"');
    expect(demo).toBeGreaterThan(html.indexOf('<h1>'));
    expect(cta).toBeGreaterThan(demo); expect(form).toBeGreaterThan(cta);
    expect(html).toContain('>Попробовать бесплатно</a>');
    expect(html).toMatch(/<input id="auth-email" type="email"[^>]*name="email"/);
  });
  it('стили демо: только токены, видео 9:16 шириной clamp(7rem,38vw,9.5rem); кнопка скрыта на ≥ 600', () => {
    const css = readFileSync('apps/web/src/app/globals.css', 'utf8');
    const block = css.slice(css.indexOf('.landing-demo {'));
    expect(block).toContain('width:clamp(7rem,38vw,9.5rem)'); expect(block).toContain('aspect-ratio:9/16');
    expect(block).toContain('background:var(--media-bg)');
    expect(block).toMatch(/@media\(min-width:600px\) \{\s*\.landing-cta \{ display:none; \}/);
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
  });
});
