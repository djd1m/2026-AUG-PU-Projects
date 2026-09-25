import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CTA_KIND, readCtaKind } from '../packages/shared/src/enums';
import { CTA_BUTTON_LABELS, CTA_CHOICE_LABELS, CtaError, ctaDisplayHost, parseCtaTarget, parseCtaUrl, readStoredCta } from '../packages/shared/src/cta';
import { VideoService } from '../apps/web/src/server/video';
import { VideoCtaService } from '../apps/web/src/server/video-cta';
import { createShortLinkHandler } from '../apps/web/src/server/short-link-handler';
import type { ShortLink } from '../apps/web/src/server/short-link';
import { appRouter } from '../apps/web/src/server/trpc';
import { UploadError } from '../apps/web/src/server/upload-contract';
import { presentVideo, type VideoRow } from '../apps/web/src/server/screen';
import { loadLimits } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
// Фича 27a clip-cta (ADR-017, FR-RESULT-006): вид и адрес призыва, video.setCta без пересборки, кнопка на /c/.
const YT = 'https://www.youtube.com/watch?v=ukZyNkgqVho';

describe('разбор адреса призыва', () => {
  it.each([
    ['пусто', ''], ['http', 'http://www.youtube.com/watch?v=1'], ['javascript', 'javascript:alert(1)'],
    ['data', 'data:text/html,<script>alert(1)</script>'], ['логин и пароль', 'https://user:pass@example.com/'],
    ['только логин', 'https://user@example.com/'], ['2049 символов', `https://example.com/${'a'.repeat(2049 - 20)}`],
    ['пробел внутри', 'https://example.com/a b'], ['пробел в начале', ' https://example.com/'], ['перевод строки', 'https://example.com/\n'],
    ['не адрес', 'youtube.com/watch'], ['ftp', 'ftp://example.com/file'], ['не строка', 42], ['null', null],
  ])('%s — отказ с понятным текстом', (_name, raw) => {
    expect(() => parseCtaUrl(raw)).toThrow(CtaError);
  });
  it('длина ровно 2049 проверена на своей границе, 2048 проходит', () => {
    const base = 'https://example.com/';
    expect(() => parseCtaUrl(base + 'a'.repeat(2049 - base.length))).toThrow('длиннее 2048');
    expect(parseCtaUrl(base + 'a'.repeat(2048 - base.length))).toHaveLength(2048);
  });
  it('ссылка на выпуск YouTube проходит как есть', () => {
    expect(parseCtaUrl(YT)).toBe(YT);
    expect(parseCtaUrl('https://t.me/clipmaker_channel')).toBe('https://t.me/clipmaker_channel');
  });
  it('IDN-домен нормализуется в punycode — зритель видит настоящий домен, а не двойника', () => {
    expect(ctaDisplayHost(parseCtaUrl('https://пример.рф/путь'))).toBe('xn--e1afmkfd.xn--p1ai');
    expect(ctaDisplayHost(YT)).toBe('youtube.com');
  });
  it('набор видов закрыт: неизвестный вид — отказ, none с адресом — отказ, отсутствие — none', () => {
    expect(CTA_KIND).toEqual(['none', 'watch_full', 'subscribe', 'open_link']);
    for (const bad of ['WATCH_FULL', 'watch', '', 1, true, {}, ['watch_full']]) expect(() => parseCtaTarget(bad, YT)).toThrow('Неизвестный вид');
    expect(() => parseCtaTarget(undefined, YT)).toThrow('Неизвестный вид');
    expect(() => parseCtaTarget('none', YT)).toThrow('адрес не указывается');
    expect(parseCtaTarget(undefined, undefined)).toEqual({ kind: 'none', url: null });
    expect(parseCtaTarget('none', null)).toEqual({ kind: 'none', url: null });
    expect(() => parseCtaTarget('watch_full', null)).toThrow('Укажите адрес');
    expect(parseCtaTarget('subscribe', YT)).toEqual({ kind: 'subscribe', url: YT });
  });
  it('чтение из хранилища fail-closed: любое расхождение — призыва нет', () => {
    for (const bad of [null, undefined, '', 'WATCH_FULL', 'premium', 0, true]) expect(readCtaKind(bad)).toBe('none');
    expect(readStoredCta('watch_full', 'javascript:alert(1)')).toEqual({ kind: 'none', url: null });
    expect(readStoredCta('watch_full', null)).toEqual({ kind: 'none', url: null });
    expect(readStoredCta('bogus', YT)).toEqual({ kind: 'none', url: null });
    expect(readStoredCta('open_link', YT)).toEqual({ kind: 'open_link', url: YT });
  });
  it('надписи — только из кода: у каждого вида своя, свободного текста нет', () => {
    expect(Object.keys(CTA_CHOICE_LABELS).sort()).toEqual([...CTA_KIND].sort());
    expect(Object.keys(CTA_BUTTON_LABELS).sort()).toEqual(CTA_KIND.filter(kind => kind !== 'none').sort());
  });
});

function createPool(row: Record<string, unknown> = {}) {
  const inserts: unknown[][] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('SELECT id FROM account')) return { rowCount: 1, rows: [{ id: 'account' }] };
    if (sql.includes('INSERT INTO video')) { inserts.push(params ?? []); return { rowCount: 0, rows: [] }; }
    if (sql.includes('FROM video')) return { rowCount: 1, rows: [{ id: 'video', declared_bytes: '24', status: 'uploading', failure_reason: null,
      music: false, teaser: false, compact: false, cta_kind: 'none', cta_url: null, upload_id: 'upload', object_key: 'source',
      upload_part_size: 24, upload_parts: [], ...row }] };
    return { rowCount: 0, rows: [] };
  });
  const connect = vi.fn(async () => ({ query, release: () => {} }));
  return { pool: { connect, query }, inserts, connect };
}
const storage = () => ({ initiate: vi.fn(), list: async () => [], sign: vi.fn(async () => []), complete: vi.fn(), abort: vi.fn(),
  head: vi.fn(), bytes: vi.fn(), delete: vi.fn() });
const upload = { filename: 'a.mp3', source: 'upload', declared_bytes: 24 };

describe('video.create с призывом', () => {
  it('непригодный адрес — 422 с причиной ДО заявки ключа и квоты (ни одного обращения к БД)', async () => {
    for (const [kind, url, text] of [['watch_full', 'http://x.example/', 'https'], ['watch_full', undefined, 'Укажите адрес'],
      ['none', YT, 'не указывается'], ['open_link', 'javascript:alert(1)', 'https']] as const) {
      const { pool, connect } = createPool();
      const service = new VideoService(pool as never, loadLimits(environment()), storage(), async () => {});
      const error = await service.create('account', randomUUID(), { ...upload, cta_kind: kind, cta_url: url }).catch(e => e);
      expect(error).toBeInstanceOf(UploadError);
      expect(error).toMatchObject({ status: 422, details: { field: 'cta_url' } });
      expect(error.message).toContain(text);
      expect(connect).not.toHaveBeenCalled();
    }
  });
  it('неизвестный вид — 422 схемой', async () => {
    const { pool } = createPool();
    const service = new VideoService(pool as never, loadLimits(environment()), storage(), async () => {});
    await expect(service.create('account', randomUUID(), { ...upload, cta_kind: 'phish', cta_url: YT })).rejects.toMatchObject({ status: 422 });
  });
  it('старый клиент без полей — none; выбранный призыв уходит в INSERT параметрами $11/$12', async () => {
    for (const [input, kind, url] of [[{}, 'none', null], [{ cta_kind: 'watch_full', cta_url: YT }, 'watch_full', YT]] as const) {
      const { pool, inserts } = createPool({ cta_kind: kind, cta_url: url });
      const service = new VideoService(pool as never, loadLimits(environment()), storage(), async () => {});
      await expect(service.create('account', randomUUID(), { ...upload, ...input })).resolves.toMatchObject({ video_id: 'video' });
      expect(inserts[0]?.slice(10)).toEqual([kind, url]);
    }
  });
  it('идемпотентность: тот же ключ с другим призывом — 409 до S3', async () => {
    for (const change of [{ cta_kind: 'subscribe', cta_url: YT }, { cta_kind: 'watch_full', cta_url: 'https://rutube.ru/video/1/' }, {}]) {
      const { pool } = createPool({ cta_kind: 'watch_full', cta_url: YT });
      const store = storage();
      const service = new VideoService(pool as never, loadLimits(environment()), store, async () => {});
      await expect(service.create('account', randomUUID(), { ...upload, ...change })).rejects.toMatchObject({ status: 409 });
      expect(store.sign).not.toHaveBeenCalled();
    }
  });
});

describe('video.setCta — только сохраняет, без пересборки', () => {
  const video = randomUUID();
  const service = (rowCount: number) => {
    const query = vi.fn(async () => ({ rowCount, rows: [] }));
    return { query, cta: new VideoCtaService({ query } as never) };
  };
  it('сохраняет нормализованный адрес одним UPDATE по владельцу, не трогая updated_at и квоту', async () => {
    const { query, cta } = service(1);
    await expect(cta.setCta('account', { video_id: video, cta_kind: 'watch_full', cta_url: YT })).resolves
      .toEqual({ video_id: video, cta_kind: 'watch_full', cta_url: YT });
    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/UPDATE video v SET cta_kind=\$3,cta_url=\$4/);
    expect(sql).toContain('v.account_id=$2'); expect(sql).toContain('deleted_at IS NULL');
    expect(sql).not.toMatch(/updated_at|quota|job_attempt|render_version/);
    expect(params).toEqual([video, 'account', 'watch_full', YT]);
  });
  it('снятие призыва — none и NULL', async () => {
    const { query, cta } = service(1);
    await cta.setCta('account', { video_id: video, cta_kind: 'none', cta_url: null });
    expect((query.mock.calls[0] as unknown as [string, unknown[]])[1]).toEqual([video, 'account', 'none', null]);
  });
  it('чужая и несуществующая запись — одинаковый 404', async () => {
    const { cta } = service(0);
    await expect(cta.setCta('stranger', { video_id: video, cta_kind: 'none' })).rejects.toMatchObject({ status: 404, message: 'Запись не найдена' });
  });
  it('непригодное — 422 без обращения к БД', async () => {
    for (const input of [{ video_id: video, cta_kind: 'watch_full', cta_url: 'http://x.example/' }, { video_id: video, cta_kind: 'nope' },
      { video_id: 'not-uuid', cta_kind: 'none' }, { video_id: video, cta_kind: 'none', extra: 1 }, { video_id: video, cta_kind: 'subscribe', cta_url: '' }]) {
      const { query, cta } = service(1);
      await expect(cta.setCta('account', input)).rejects.toMatchObject({ status: 422 });
      expect(query).not.toHaveBeenCalled();
    }
  });
  it('tRPC: 404/422 сохраняют коды, неизвестная ошибка — 500 без подробностей', async () => {
    const caller = (setCta: () => Promise<never>) => appRouter.createCaller({ account: 'a', idempotencyKey: null, requestId: 'r',
      video: { create: async () => { throw new Error('no'); } }, cta: { setCta } });
    await expect(caller(async () => { throw new UploadError('not_found', 'Запись не найдена', 404); }).video.setCta({})).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(caller(async () => { throw new UploadError('invalid', 'Разрешены только ссылки https://', 422); }).video.setCta({})).rejects.toMatchObject({ code: 'UNPROCESSABLE_CONTENT', message: 'Разрешены только ссылки https://' });
    await expect(caller(async () => { throw new Error('db down'); }).video.setCta({})).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Не удалось сохранить призыв. Повторите позже' });
    await expect(appRouter.createCaller({ account: 'a', idempotencyKey: null, requestId: 'r', video: { create: async () => { throw new Error('no'); } } })
      .video.setCta({})).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });
  it('экран записи отдаёт текущий призыв fail-closed', () => {
    const row = { id: 'v', status: 'done', created_at: new Date(), updated_at: new Date(), finished_at: null, duration_seconds: null,
      stage_progress: null, clips_done: 1, clips_total: 1, failure_reason: null, object_key: null, actual_bytes: null, plan: 'free', wait_reason: null } as VideoRow;
    expect(presentVideo({ ...row, cta_kind: 'watch_full', cta_url: YT })).toMatchObject({ cta_kind: 'watch_full', cta_url: YT });
    expect(presentVideo({ ...row, cta_kind: 'watch_full', cta_url: null })).toMatchObject({ cta_kind: 'none', cta_url: null });
    expect(presentVideo(row)).toMatchObject({ cta_kind: 'none', cta_url: null });
  });
});

const now = new Date('2026-09-25T12:00:00.000Z');
const link: ShortLink = { id: 'link', code: 'CTDUUG', account_id: 'owner', title: 'Момент <b>выпуска</b>', status: 'done',
  thumbnail_key: null, expires_at: null, finished_at: now, plan: 'free' };
export async function landingHtml(overrides: Partial<ShortLink> = {}, cookie = '') {
  const handle = createShortLinkHandler({ referralSecret: 'test-secret', trustedProxyHops: 1, clock: () => now,
    links: { find: vi.fn().mockResolvedValue({ ...link, ...overrides }), recordView: vi.fn().mockResolvedValue(undefined) },
    preview: vi.fn().mockResolvedValue(null), auth: { authenticate: vi.fn().mockResolvedValue(null) }, allowRead: vi.fn().mockResolvedValue(true) });
  const response = await handle(new Request('https://app.example/c/CTDUUG', { headers: { 'x-forwarded-for': '192.0.2.9, 127.0.0.1', cookie } }), 'CTDUUG');
  return { response, html: await response.text() };
}
const anchors = (html: string) => [...html.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g)].map(m => ({ attrs: m[1]!, text: m[2]! }));
const ctaAnchors = (html: string) => anchors(html).filter(a => /class="cta"/.test(a.attrs));

describe('/c/{code}: кнопка призыва автора', () => {
  it('с призывом: главная кнопка — внешняя ссылка автора с rel, домен и пометка видны, «Сделать свои клипы» вторична', async () => {
    const { response, html } = await landingHtml({ cta_kind: 'watch_full', cta_url: `${YT}&t=5` });
    expect(response.status).toBe(200); expect(response.headers.get('location')).toBeNull();
    const primary = ctaAnchors(html);
    expect(primary).toHaveLength(1);
    expect(primary[0]!.text).toBe('Смотреть полный выпуск →');
    // href — ровно адрес автора (экранированный), не редирект через наш домен.
    expect(primary[0]!.attrs).toContain(`href="${YT}&amp;t=5"`);
    expect(primary[0]!.attrs).toContain('rel="noopener noreferrer nofollow"'); expect(primary[0]!.attrs).toContain('target="_blank"');
    expect(html).not.toMatch(/redirect|[?&]to=/);
    expect(html).toContain('Ссылка автора клипа · <span>youtube.com</span>');
    expect(anchors(html).find(a => a.text === 'Сделать свои клипы')?.attrs).toBe(' class="secondary-link" href="/"');
    // Пометка идёт до вторичной кнопки: основное действие первым по DOM.
    expect(html.indexOf('class="cta"')).toBeLessThan(html.indexOf('class="secondary-link"'));
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; img-src https: http:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  });
  it.each(['none', null, undefined, 'bogus'])('без призыва (%s) — прежняя единственная кнопка .cta «Сделать свои клипы»', async kind => {
    const { html } = await landingHtml({ cta_kind: kind, cta_url: kind === 'bogus' ? YT : null });
    expect(ctaAnchors(html)).toEqual([{ attrs: ' class="cta" href="/"', text: 'Сделать свои клипы' }]);
    expect(html).not.toContain('secondary-link"'); expect(html).not.toContain('Ссылка автора');
  });
  it('непригодный адрес в базе (обход CHECK) — кнопки призыва нет, а не ссылка на него', async () => {
    const { html } = await landingHtml({ cta_kind: 'open_link', cta_url: 'javascript:alert(1)' });
    expect(html).not.toContain('javascript:'); expect(ctaAnchors(html)[0]!.attrs).toContain('href="/"');
  });
  it('XSS: кавычки, угловые скобки и апостроф в query/hash не выходят из атрибута', async () => {
    const url = parseCtaUrl(`https://evil.example/p?q="><script>alert(1)</script>#'onmouseover='alert(1)`);
    const { html } = await landingHtml({ cta_kind: 'open_link', cta_url: url });
    expect(html).not.toContain('<script>'); expect(html).not.toContain(`'onmouseover`);
    const href = ctaAnchors(html)[0]!.attrs.match(/href="([^"]*)"/)![1]!;
    expect(href).not.toMatch(/[<>"']/);
    expect(href.replaceAll('&amp;', '&').replaceAll('&#39;', "'")).toBe(url);
    expect(html).toContain('<span>evil.example</span>');
  });
  it('первый экран: FIRST_SCREEN_ACTIONS для /c/ — .cta, и .cta ровно один в обоих вариантах', async () => {
    const { firstScreenSelector } = await import('../scripts/responsive/rules.mjs');
    expect(firstScreenSelector('/c/CTDUUG')).toBe('.cta');
    for (const overrides of [{}, { cta_kind: 'subscribe', cta_url: 'https://t.me/x' }]) {
      expect((await landingHtml(overrides)).html.match(/class="cta"/g)).toHaveLength(1);
    }
  });
  it('фикстуры прибора R9 совпадают с настоящей страницей /c/ (не устарели)', async () => {
    const light = 'n5_theme=light';
    for (const [file, overrides, cookie] of [['c-cta-dark', { cta_kind: 'watch_full', cta_url: YT }, ''],
      ['c-cta-light', { cta_kind: 'watch_full', cta_url: YT }, light], ['c-plain-dark', {}, '']] as const) {
      const { html } = await landingHtml({ title: 'Почему короткие клипы продают полный выпуск лучше любого трейлера', ...overrides }, cookie);
      const path = `tests/fixtures/responsive/${file}.html`;
      if (process.env.N5_WRITE_CTA_FIXTURES === '1') writeFileSync(path, html);
      expect(readFileSync(path, 'utf8'), `${file} устарела: N5_WRITE_CTA_FIXTURES=1 npx vitest run tests/clip-cta.test.ts`).toBe(html);
    }
  });
});

describe('миграция 020 и закрытое перечисление', () => {
  const sql = readFileSync('packages/db/migrations/020_clip_cta.sql', 'utf8');
  it('CHECK вида, пары и адреса объявлены; source_url не переиспользован', () => {
    expect(sql).toContain("CHECK (cta_kind IN ('none','watch_full','subscribe','open_link'))");
    expect(sql).toContain("CHECK ((cta_kind = 'none') = (cta_url IS NULL))");
    expect(sql).toContain("cta_url LIKE 'https://%'"); expect(sql).toContain('BETWEEN 9 AND 2048');
    expect(sql.replace(/--[^\n]*/g, '')).not.toContain('source_url');
  });
});

describe('формы призыва: загрузка и экран записи', () => {
  it('поле выбора: четыре вида из кода; адрес появляется только для вида с адресом', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { CtaFields, VideoCtaForm, ctaProblem } = await import('../apps/web/src/app/videos/CtaFields');
    const none = renderToStaticMarkup(createElement(CtaFields, { id: 'x', kind: 'none', url: '', onKind: () => {}, onUrl: () => {} }));
    expect([...none.matchAll(/<option value="([^"]+)"/g)].map(m => m[1])).toEqual([...CTA_KIND]);
    expect(none).toContain('Что сделать зрителю в конце'); expect(none).not.toContain('type="url"');
    const full = renderToStaticMarkup(createElement(CtaFields, { id: 'x', kind: 'watch_full', url: YT, onKind: () => {}, onUrl: () => {} }));
    expect(full).toContain('type="url"'); expect(full).toContain('for="x-url"'); expect(full).toContain('maxLength="2048"');
    const form = renderToStaticMarkup(createElement(VideoCtaForm, { videoId: 'v', initialKind: 'watch_full', initialUrl: YT }));
    expect(form).toContain('Призыв в конце'); expect(form).toContain(`value="${YT.replace('&', '&amp;')}"`);
    expect(ctaProblem('watch_full', 'http://x.example/')).toBe('Разрешены только ссылки https://');
    expect(ctaProblem('none', 'мусор')).toBeNull(); expect(ctaProblem('open_link', ` ${YT} `)).toBeNull();
  });
  it('загрузчик передаёт вид и адрес в video.create и хранит их для возобновления тем же ключом', () => {
    const source = readFileSync('apps/web/src/app/upload/Uploader.tsx', 'utf8');
    expect(source).toContain('cta_kind: current.ctaKind, cta_url: current.ctaUrl');
    expect(source).toContain('ctaKind: readCtaKind(saved.ctaKind)');
    expect(source).toMatch(/const problem = resumed \? null : ctaProblem\(ctaKind, ctaUrl\);\s+if \(problem\) \{ setMessage\(problem\); return; \}\s+const current =/);
    expect(readFileSync('apps/web/src/app/videos/[videoId]/VideoDetail.tsx', 'utf8')).toContain('<VideoCtaForm videoId={videoId} initialKind={initialVideo.cta_kind}');
  });
});
