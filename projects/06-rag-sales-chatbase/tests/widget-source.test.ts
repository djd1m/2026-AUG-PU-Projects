// Стражи исходника и чистые функции виджета (FR-WIDGET-001/003, NFR-SEC-002, NFR-PERF-003). Поведение в НАСТОЯЩЕМ
// браузере на чужом origin — tests/browser/widget-embed.test.ts; здесь то, что видно без браузера:
//  - в коде виджета нет путей, которые требуют от хозяина unsafe-inline или исполняют разметку;
//  - нет обработчиков и переменных на window хозяина;
//  - потолок бандла 45 КБ gzip валит сборку (проверка на заведомо большом файле — страж умеет падать);
//  - разбор ответов сервера fail-closed: ссылка только http(s), бейдж без ссылки — нет конфигурации.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseAsk, parseConfig, safeHref } from '../apps/widget/src/api';
import { classifyBadgeVisibility } from '../apps/widget/src/badge';
import { BUDGET_BYTES, checkBundleSize } from '../apps/widget/scripts/check-bundle-size.mjs';

const SRC = 'apps/widget/src';
const sources = readdirSync(SRC).filter((f) => f.endsWith('.ts')).map((f) => ({ file: f, code: readFileSync(path.join(SRC, f), 'utf8') }));
// Комментарии вырезаются: стражи смотрят на код, а не на объяснение, почему так нельзя.
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('страж исходника виджета', () => {
  it('исходники на месте (страж не зеленеет на пустом множестве)', () => {
    expect(sources.map((s) => s.file).sort()).toEqual(['api.ts', 'badge.ts', 'chat-window.ts', 'index.ts', 'session.ts', 'styles.ts']);
  });
  const forbidden: Array<[string, RegExp]> = [
    ['innerHTML/outerHTML', /\.(inner|outer)HTML\b/], ['insertAdjacentHTML', /insertAdjacentHTML/], ['document.write', /document\.write/],
    ['style-атрибут', /setAttribute\(\s*['"]style['"]/], ['style.cssText', /\.cssText\b/], ['элемент <style>', /createElement\(\s*['"]style['"]/],
    ['<link>', /createElement\(\s*['"]link['"]/], ['document.head', /document\.head\b/], ['обработчик на window', /window\.(addEventListener|on[a-z]+\s*=)/],
    ['глобальная переменная', /(window|globalThis|self)\.[A-Za-z_$]+\s*=[^=]/], ['eval/new Function', /\beval\s*\(|new\s+Function\s*\(/],
    ['credentials: include', /credentials:\s*['"]include['"]/],
  ];
  for (const [name, pattern] of forbidden) {
    it(`нет: ${name}`, () => {
      for (const s of sources) expect(code(s.code), `${s.file}: ${name}`).not.toMatch(pattern);
    });
  }
  it('каждый fetch — credentials: omit', () => {
    const api = code(sources.find((s) => s.file === 'api.ts')!.code);
    const calls = api.match(/fetch\(/g)?.length ?? 0;
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(api.match(/credentials:\s*'omit'/g)?.length).toBe(calls);
  });
  it('стили — только adoptedStyleSheets, корень сброшен all: initial', () => {
    const styles = code(sources.find((s) => s.file === 'styles.ts')!.code);
    expect(styles).toMatch(/adoptedStyleSheets\s*=\s*\[sheet\]/);
    expect(styles).toMatch(/:host\{all:initial !important/);
    expect(styles).toMatch(/\.n6\{all:initial/);
  });
  it('CORS в коде сервера — без джокера и без Allow-Credentials', () => {
    const cors = code(readFileSync('apps/web/src/server/check-origin.ts', 'utf8') + readFileSync('apps/web/src/server/widget-handler.ts', 'utf8'));
    expect(cors).not.toMatch(/['"]\*['"]/);
    expect(cors).not.toMatch(/Allow-Credentials/i);
  });
});

describe('потолок бандла 45 КБ gzip', () => {
  it('собранный бандл в пределах; файл случайных байтов выше потолка — ok: false', () => {
    const manifest = 'apps/web/widget-bundle/manifest.json';
    expect(existsSync(manifest), 'бандл не собран: npm run build --workspace=apps/widget').toBe(true);
    const { file } = JSON.parse(readFileSync(manifest, 'utf8')) as { file: string };
    expect(checkBundleSize(path.join('apps/web/widget-bundle', file)).ok).toBe(true);
    const big = path.join(mkdtempSync(path.join(tmpdir(), 'n6-bundle-')), 'widget.big.js');
    writeFileSync(big, randomBytes(BUDGET_BYTES + 4096));
    expect(checkBundleSize(big).ok).toBe(false);
  });
});

describe('разбор ответов сервера (fail-closed)', () => {
  const config = { company_name: 'Колос', greeting: '', contact: 'info@kolos.ru', badge_required: true, badge_href: 'https://sufler.example/?from=a&utm_source=badge' };
  it('ссылка — только http(s)', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.example', '', null, 42]) expect(safeHref(bad), String(bad)).toBeNull();
    expect(safeHref('https://a.example/x')).toBe('https://a.example/x');
  });
  it('badge_required строго boolean; бейдж без ссылки — конфигурации нет (виджет не рисуется)', () => {
    expect(parseConfig({ data: config })).toEqual(config);
    for (const badge_required of ['false', 0, null, undefined]) expect(parseConfig({ data: { ...config, badge_required } }), String(badge_required)).toBeNull();
    expect(parseConfig({ data: { ...config, badge_href: 'javascript:alert(1)' } })).toBeNull();
    expect(parseConfig({ data: { ...config, badge_required: false, badge_href: null } })).toMatchObject({ badge_required: false, badge_href: null });
    expect(parseConfig({ data: { ...config, contact: '' } })).toBeNull();
    expect(parseConfig(null)).toBeNull();
  });
  it('ответ на вопрос: answered/unknown/лимит/ошибка; ссылка источника javascript: отбрасывается', () => {
    expect(parseAsk(200, { data: { status: 'answered', text: 'Да', source: { title: 'Цены', url: 'javascript:alert(1)', excerpt: 'x' } } }))
      .toEqual({ kind: 'answered', text: 'Да', source: { title: 'Цены', url: null, excerpt: 'x' } });
    expect(parseAsk(200, { data: { status: 'unknown', text: 'Не знаю. Напишите: x' } })).toEqual({ kind: 'unknown', text: 'Не знаю. Напишите: x' });
    expect(parseAsk(429, { error: { code: 'limit', message: 'Лимит' } })).toEqual({ kind: 'limit', text: 'Лимит' });
    expect(parseAsk(404, { error: {} })).toEqual({ kind: 'error' });
    expect(parseAsk(200, { data: { status: 'answered' } })).toEqual({ kind: 'error' });
  });
  it('классификация видимости бейджа (перенос N1): удалён / скрыт напрямую / нулевой размер / виден', () => {
    const base = { display: 'inline-flex', visibility: 'visible', opacity: '1', hidden: false, offsetWidth: 90, offsetHeight: 20 };
    expect(classifyBadgeVisibility(null)).toBe('missing');
    for (const over of [{ display: 'none' }, { visibility: 'hidden' }, { opacity: '0' }, { hidden: true }]) {
      expect(classifyBadgeVisibility({ ...base, ...over }), JSON.stringify(over)).toBe('hidden-direct');
    }
    expect(classifyBadgeVisibility({ ...base, offsetWidth: 0, offsetHeight: 0 })).toBe('zero-size-ancestor');
    expect(classifyBadgeVisibility(base)).toBe('ok');
  });
});
