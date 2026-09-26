import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as exec from '../apps/worker/src/render/exec';
import * as probe from '../apps/worker/src/render/probe';
import { buildFilterChain, renderClip } from '../apps/worker/src/render/ffmpeg';
import { CTA_FONT_SIZE, CTA_MIN_FONT_SIZE, CTA_SECONDS, ctaPlateHeight, ctaWindowStart, ctaZone, layoutCta, prepareCta } from '../apps/worker/src/render/cta-overlay';
import { watermarkGeometry, watermarkPlateTop } from '../packages/shared/src/watermark';
import { CTA_FRAME_LABELS, ctaPixelsChange } from '../packages/shared/src/cta';
import { SUBTITLE_MARGIN_V, SUBTITLE_OUTLINE, SUBTITLE_SHADOW, generateSubtitleFile } from '../apps/worker/src/render/subtitles';
import { buildFlashFilter } from '../apps/worker/src/render/packshot';
import { quotaMessages } from '../apps/web/src/lib/limits-contract';
import { ctaSavedMessage } from '../apps/web/src/app/videos/CtaFields';
// Фича 27b clip-cta (ADR-017): надпись призыва в кадре — геометрия, окно, закрытый набор, fail-closed.
afterEach(() => { vi.restoreAllMocks(); });
const W = 1080, H = 1920, ORIGIN = 'https://clipmkr.ru', CODE = 'WWWWWW';

describe('геометрия надписи призыва', () => {
  it('полоса — между низом субтитров и верхом метки, числами', () => {
    const zone = ctaZone(H);
    expect(zone).toEqual({ top: 1438, bottom: 1561 });
    expect(zone.top).toBeGreaterThan(H - SUBTITLE_MARGIN_V + SUBTITLE_OUTLINE + SUBTITLE_SHADOW);
    expect(watermarkPlateTop(H)).toBe(watermarkGeometry(W, H, ORIGIN, CODE).y);
    expect(zone.bottom).toBeLessThan(watermarkGeometry(W, H, ORIGIN, CODE).y);
    // Стиль ASS берёт отступ из той же константы, что и геометрия: разъехаться им нечем.
    expect(generateSubtitleFile([{ word: 'Привет', start: 0, end: 1 }], 0, 20, 'portrait')).toContain(`,2,54,54,${SUBTITLE_MARGIN_V},1`);
  });
  it.each(Object.entries(CTA_FRAME_LABELS))('%s — кегль 72, плашка внутри полосы и безопасного поля', (_kind, text) => {
    const zone = ctaZone(H), layout = layoutCta(text, W, zone)!;
    expect(layout.fontSize).toBe(CTA_FONT_SIZE);
    expect(layout.y).toBeGreaterThanOrEqual(zone.top); expect(layout.y + layout.plateHeight).toBeLessThanOrEqual(zone.bottom);
    expect(layout.x).toBeGreaterThanOrEqual(54); expect(layout.x + layout.plateWidth).toBeLessThanOrEqual(W - 54);
  });
  it('fail-closed: не помещается по высоте — кегль уменьшается до предела, ниже предела — надписи нет', () => {
    const text = CTA_FRAME_LABELS.subscribe;
    expect(layoutCta(text, W, { top: 0, bottom: ctaPlateHeight(56) })!.fontSize).toBe(56);
    expect(layoutCta(text, W, { top: 0, bottom: ctaPlateHeight(CTA_MIN_FONT_SIZE) })!.fontSize).toBe(CTA_MIN_FONT_SIZE);
    expect(layoutCta(text, W, { top: 0, bottom: ctaPlateHeight(CTA_MIN_FONT_SIZE) - 1 })).toBeNull();
    expect(layoutCta(text, 400, ctaZone(H))).toBeNull();
  });
  it('непомещение — клип без надписи и запись в журнал, не падение рендера', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {}), reasons: string[] = [];
    expect(prepareCta('subscribe', 400, H, 20, false, reason => reasons.push(reason))).toBeNull();
    expect(reasons).toEqual(['no_room']);
    expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'cta_skipped', kind: 'subscribe', reason: 'no_room' }));
  });
});

describe('окно показа и закрытый набор', () => {
  it('последние 2,5 с, не раньше конца заголовка и не раньше начала клипа', () => {
    expect(CTA_SECONDS).toBe(2.5);
    expect(ctaWindowStart(20, false)).toBe(17.5); expect(ctaWindowStart(20, true)).toBe(17.5);
    expect(ctaWindowStart(4, true)).toBe(2.5); expect(ctaWindowStart(2, false)).toBe(0);
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(prepareCta('watch_full', W, H, 2.5, true)).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('window_empty'));
  });
  it.each([['none'], [undefined], [null], ['bogus'], ['WATCH_FULL'], [42]])('%s — надписи нет и журнал молчит', kind => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(prepareCta(kind, W, H, 20, false)).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });
  it('текст — только из словаря, адреса в фильтре нет', () => {
    const prepared = prepareCta('watch_full', W, H, 30, true)!;
    expect(prepared.result).toEqual({ kind: 'watch_full', text: 'Полный выпуск — по ссылке', font_size: 72, start_seconds: 27.5 });
    expect(prepared.filter).toContain("drawtext=text='Полный выпуск — по ссылке':expansion=none");
    expect(prepared.filter.match(/enable='gte\(t,27\.5\)'/g)).toHaveLength(2);
    expect(prepared.filter).not.toMatch(/https?:|youtube|textfile/);
    // Воркер не получает адрес автора вовсе: в SELECT рендера его нет.
    expect(readFileSync('packages/db/src/render.ts', 'utf8')).not.toContain('cta_url');
    expect(readFileSync('packages/db/src/render.ts', 'utf8')).toContain('v.cta_kind');
  });
  it('пиксели меняет только вид: смена одного адреса — без пересборки', () => {
    expect(ctaPixelsChange('watch_full', 'watch_full')).toBe(false);
    expect(ctaPixelsChange('none', 'watch_full')).toBe(true); expect(ctaPixelsChange('watch_full', 'none')).toBe(true);
    expect(ctaPixelsChange('watch_full', 'subscribe')).toBe(true);
    expect(ctaPixelsChange('bogus', 'none')).toBe(false);
  });
});

describe('цепочка фильтров', () => {
  it('порядок: вспышка → призыв → метка; без призыва цепочка побайтово прежняя', () => {
    const flash = buildFlashFilter(19200), cta = prepareCta('open_link', W, H, 20, false)!.filter;
    const chain = buildFilterChain('portrait', null, true, ORIGIN, CODE, undefined, undefined, undefined, flash, undefined, cta);
    expect(chain.indexOf(flash)).toBeLessThan(chain.indexOf(cta));
    expect(chain.indexOf(cta)).toBeLessThan(chain.indexOf('drawbox=x=54'));
    expect(buildFilterChain('portrait', null, true, ORIGIN, CODE, undefined, undefined, undefined, flash, undefined, undefined))
      .toBe(buildFilterChain('portrait', null, true, ORIGIN, CODE, undefined, undefined, undefined, flash));
  });
  it('renderClip: вид из базы → надпись в ffmpeg; none → нет; результат называет надпись', async () => {
    vi.spyOn(probe, 'probeDuration').mockResolvedValue(20);
    vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null);
    const graphs: string[] = [];
    vi.spyOn(exec, 'execFFmpeg').mockImplementation(async args => { graphs.push(args[args.indexOf('-filter_complex') + 1]!); await writeFile(args.at(-1)!, 'v'); });
    const dir = await mkdtemp('/tmp/cta-render-');
    try {
      const base = { inputPath: `${dir}/in.mp4`, outputPath: `${dir}/out.mp4`, startTime: 0, endTime: 20, format: 'portrait' as const,
        words: [], watermark: true, origin: ORIGIN, code: CODE };
      const on = await renderClip({ ...base, cta: 'subscribe' }), off = await renderClip({ ...base, cta: 'none' }), legacy = await renderClip(base);
      expect(on.cta).toEqual({ kind: 'subscribe', text: 'Подписывайтесь — ссылка ниже', font_size: 72, start_seconds: 17.5 });
      expect(graphs[0]).toContain("text='Подписывайтесь — ссылка ниже'");
      // Без призыва форма результата прежняя: ключа cta нет вовсе (эталоны music.test.ts).
      expect(off).not.toHaveProperty('cta'); expect(legacy).not.toHaveProperty('cta');
      expect(graphs[1]).toBe(graphs[2]); expect(graphs[1]).not.toContain('Подписывайтесь');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

describe('тексты', () => {
  it('отказ квоты пересборок — нейтральный, не про музыку', () => {
    expect(quotaMessages.user_rerenders).toBe('Пересборки на сегодня исчерпаны');
  });
  it('сообщение после сохранения называет число пересборок', () => {
    expect(ctaSavedMessage('watch_full', 3)).toContain('Пересобираем клипов: 3');
    expect(ctaSavedMessage('watch_full', 0)).toBe('Сохранено. Кнопка уже на страницах клипов.');
  });
});
