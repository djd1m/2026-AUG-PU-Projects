import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { domRules, axeRule, firstScreenRule, firstScreenSelectors, FIRST_SCREEN_VIEWPORTS } from '../../scripts/responsive/rules.mjs';
import { preflight } from '../../scripts/responsive/input.mjs';
import { VideoDetail } from '../../apps/web/src/app/videos/[videoId]/VideoDetail';
import { ThemeToggle } from '../../apps/web/src/app/ThemeToggle';
import type { VideoScreen, ClipScreen } from '../../apps/web/src/lib/screen-contract';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

// Фича 29 progress-ribbon: НАСТОЯЩАЯ разметка экрана записи (VideoDetail + шапка кабинета) с НАСТОЯЩИМ globals.css.
// R9 — тот же селектор, что прибор берёт для /dashboard/videos/{id}. Фикстура — готовое состояние (как seed-ui-fixture).
const VIDEO_ID = '8f0c2a4e-1b2c-4d5e-8f90-123456789abc';
const SCREENS = 'docs/features/progress-ribbon/screens';
const CSS = readFileSync('apps/web/src/app/globals.css', 'utf8');
const START = '/* progress-ribbon:first-screen:start', END = '/* progress-ribbon:first-screen:end */';
// Мутация «панель первой карточки ниже сгиба»: тот же экран без компактного блока фичи 29.
const CSS_WITHOUT_BLOCK = CSS.slice(0, CSS.indexOf(START)) + CSS.slice(CSS.indexOf(END) + END.length);
const now = new Date().toISOString();
const video = (over: Partial<VideoScreen> = {}): VideoScreen => ({ video_id: VIDEO_ID, status: 'done', created_at: now, updated_at: now,
  duration_seconds: 3600, user_state: 'успех', stage_label: 'Клипы готовы', stage_progress: 100, clips_done: 3, clips_total: 3,
  no_response: false, failure_reason: null, next_action: null, retry_after: null, poll_after_seconds: 5, cta_kind: 'none', cta_url: null,
  failed_stage: null, ...over });
const clip = (index: number, available = true): ClipScreen => ({ clip_id: `00000000-0000-4000-8000-00000000000${index}`, index, start: 12, end: 48,
  title: 'Почему короткий клип набирает больше, чем весь выпуск', status: available ? 'done' : 'rendering', watermarked: true,
  expires_at: null, available, duration_seconds: 36.2, score: 81, components: { hook: 29, completeness: 27, length: 25 },
  explanations: { hook: 'Вопрос с первых слов', completeness: 'Ответ законченный', length: 'Без лишних пауз' } });
const STATES: Record<string, { video: VideoScreen; clips: ClipScreen[] }> = {
  done: { video: video(), clips: [clip(1), clip(2), clip(3)] },
  running: { video: video({ status: 'rendering', user_state: 'выполняется', stage_label: 'Режем: готово 1 из 3', stage_progress: 40, clips_done: 1 }),
    clips: [clip(1), clip(2, false), clip(3, false)] },
  silent: { video: video({ status: 'selecting', user_state: 'выполняется', stage_label: 'Нет ответа от обработки, проверяем', stage_progress: null, clips_done: 0, clips_total: 0, no_response: true }), clips: [] },
  failure: { video: video({ status: 'failed', user_state: 'отказ', stage_label: 'Обработка не завершена', stage_progress: null, clips_done: 0, clips_total: 0,
    failure_reason: 'Обработка перестала отвечать.', next_action: 'retry', failed_stage: 'select' }), clips: [] },
};
function page(theme: 'dark' | 'light', state: string, css: string) {
  const { video: initialVideo, clips } = STATES[state]!;
  const body = renderToStaticMarkup(createElement(Fragment, null,
    createElement('nav', { className: 'navigation' }, createElement('a', { className: 'brand', href: '/dashboard' }, createElement('span', null, '◧'), ' КлипМейкер'),
      createElement('a', { href: '/dashboard' }, 'Мои записи'), createElement(ThemeToggle, { initial: theme })),
    createElement('main', { className: 'container' }, createElement(VideoDetail, { videoId: VIDEO_ID, initialVideo, initialClips: clips, initialPacks: [], consentHash: 'consent' }))));
  return `<!doctype html><html lang="ru" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>КлипМейкер</title><style>${css}</style></head><body>${body}</body></html>`;
}
let server: Server;
let base: string;
beforeAll(async () => {
  try { await preflight(['chromium', 'webkit']); }
  catch (error) { throw new Error(`НЕ ВЫПОЛНЕНО: ${String(error)}`); }
  server = createServer((req, res) => {
    const match = /^\/(dark|light)-(done|running|silent|failure)(-mutant)?\.html$/.exec(req.url ?? '');
    if (!match) { res.writeHead(404).end(); return; }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(page(match[1] as 'dark' | 'light', match[2]!, match[3] ? CSS_WITHOUT_BLOCK : CSS));
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Нет loopback порта');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { if (server) await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });
const errors = (found: { severity: string; rule: string; message: string; selector?: string }[]) =>
  found.filter(f => f.severity === 'error').map(f => `${f.rule} ${f.selector ?? ''}: ${f.message}`);

for (const [name, engine] of Object.entries({ chromium, webkit })) describe(`экран записи ${name}`, () => {
  let browser: Browser;
  beforeAll(async () => { browser = await engine.launch(); });
  afterAll(async () => { await browser?.close(); });
  async function open(file: string, viewport: { width: number; height: number }, run: (page: Page) => Promise<void>) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    try { const p = await context.newPage(); await p.goto(`${base}/${file}.html`); await run(p); }
    finally { await context.close(); }
  }
  const [selector] = firstScreenSelectors(`/dashboard/videos/${VIDEO_ID}`);
  it('селектор R9 экрана записи — из прибора', () => { expect(selector).toBe('.clip-card:first-of-type .clip-actions'); });
  for (const theme of ['dark', 'light'] as const) for (const { w, h } of FIRST_SCREEN_VIEWPORTS) {
    it(`R9 ${theme} ${w}x${h}: «Скачать · Ссылка · Гостю» первой карточки в первом экране`, () => open(`${theme}-done`, { width: w, height: h }, async p => {
      const found = await firstScreenRule(p, selector!);
      const geometry = await p.evaluate(() => {
        const box = (s: string) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }; };
        return { innerHeight, navigation: box('.navigation'), header: box('.detail-header'), h1: box('.detail-header h1'), ribbon: box('.status-panel'),
          heading: box('.section-heading'), preview: box('.clip-card .clip-preview'), actions: box('.clip-card .clip-actions') };
      });
      mkdirSync(SCREENS, { recursive: true });
      const stem = `${SCREENS}/${name}-${theme}-first-screen-${w}x${h}`;
      writeFileSync(`${stem}.json`, JSON.stringify(geometry, null, 2) + '\n');
      await p.screenshot({ path: `${stem}.png`, fullPage: false });
      expect(found, JSON.stringify(geometry)).toEqual([]);
      // Шапка кабинета в одну строку и на 360 (порог 22.5rem включительно): не выше 3/2 одной строки.
      expect(geometry.navigation.height).toBeLessThan(100);
    }));
  }
  for (const { w, h } of FIRST_SCREEN_VIEWPORTS) {
    it(`R9 мутация ${w}x${h}: без компактного блока фичи 29 панель уходит за сгиб — красное`, () => open('dark-done-mutant', { width: w, height: h }, async p => {
      const found = await firstScreenRule(p, selector!);
      expect(found).toHaveLength(1); expect(found[0].message).toBe('Основное действие вне первого экрана');
    }));
  }
  for (const state of ['done', 'running']) {
    // Композицию десктопа R-правила не видят — скриншот 1440 обязателен для глаза (навык responsive-ui).
    it(`${state} 1440: без горизонтального скролла; скриншот десктопа`, async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const p = await context.newPage(); await p.goto(`${base}/dark-${state}.html`);
        expect(errors(await domRules(p, ['R1']))).toEqual([]);
        mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: `${SCREENS}/${name}-dark-${state}-1440.png`, fullPage: false });
      } finally { await context.close(); }
    });
  }
  for (const state of ['done', 'running', 'silent', 'failure']) {
    for (const theme of ['dark', 'light'] as const) {
      it(`${state} ${theme} 320: без горизонтального скролла, цели 44, axe без отказов`, () => open(`${theme}-${state}`, { width: 320, height: 640 }, async p => {
        expect(errors(await domRules(p, ['R1', 'R2', 'R5']))).toEqual([]);
        expect(errors(await axeRule(p))).toEqual([]);
        if (state !== 'done') {
          // Лента — ol с ровно одной текущей стадией; состояние — текстом.
          expect(await p.locator('ol.progress-ribbon > li').count()).toBe(4);
          expect(await p.locator('ol.progress-ribbon > li[aria-current=step]').count()).toBe(1);
        } else expect(await p.locator('ol.progress-ribbon').count()).toBe(0);
        if (theme === 'dark') { mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: `${SCREENS}/${name}-${theme}-${state}-320.png`, fullPage: false }); }
      }));
    }
  }
});
