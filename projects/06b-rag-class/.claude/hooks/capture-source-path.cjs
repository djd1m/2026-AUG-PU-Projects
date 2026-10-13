#!/usr/bin/env node
'use strict';

/**
 * capture-source-path.cjs — инструмент для оси «путь» Фазы 0.5.
 *
 * NOT an event hook. Like `check-ports.cjs`, `check-growth-trace.cjs`, `check-look-trace.cjs` and
 * `check-docs-complete.cjs`, it lives here because this directory already carries plain Node
 * utilities; nothing registers it in settings.json. This package's hooks are NON-BLOCKING by
 * contract, so a hook could never refuse anything — it could only print. Invoke it:
 *
 *   node .claude/hooks/capture-source-path.cjs <url> [опции]
 *
 * ─── ЗАЧЕМ ─────────────────────────────────────────────────────────────────────────────────────
 * Фаза 0.5 снимает ОБЛИК исходного продукта навыком `clone-website` — «clone exactly what is
 * visible at that URL», ОДНА страница. Ось «путь» — в каком порядке человек проходит продукт:
 * регистрация, онбординг, первое ценное действие, пейволл — не снималась ничем: колонка «Ось» в
 * таблице-семени существовала, а инструмента под неё не было. Это он.
 *
 * ОДНО семейство идентификаторов: инструмент выпускает строки `FR-LOOK-nnn`, продолжая нумерацию
 * существующего профиля, и проставляет им ось `путь`. Второго семейства и второго артефакта нет —
 * ось это КОЛОНКА.
 *
 * ─── ТРИ ИСХОДА, И КАЖДОМУ СВОЙ КОД ВОЗВРАТА ───────────────────────────────────────────────────
 *   0  СНЯТ           путь прокликан; на stdout строки `FR-LOOK-nnn` с осью `путь`
 *   1  ИСТОЧНИКА НЕТ  источник ОТКРЫЛСЯ, но пути в нём нет: ни одного перехода со стартового
 *                     экрана (одноэкранный продукт). Это ДОКАЗАННЫЙ отрицательный ответ, а не
 *                     слепота — мы посмотрели. Печатается готовая строка объявления оси.
 *   2  НЕ ИЗМЕРЕНО    снять не удалось; причина из ЗАКРЫТОГО списка, каждая означает СВОЙ ремонт:
 *                       no-browser         Playwright/браузер не найден на машине
 *                       robots-disallowed  robots.txt цели запрещает обход (или не прочитан)
 *                       bot-protected      сайт ответил 403/429 — защита от ботов
 *                       auth-required      СТАРТОВЫЙ экран уже за входом
 *                       timeout            навигация не уложилась в бюджет
 *                       unreachable        DNS/сеть/HTTP-ошибка, не 403 и не 429
 *                       out-of-scope       не http(s), или аргументы вне области инструмента
 *
 * Эти же значения — легальные причины в `docs/source-product-profile.md`, и `check-look-trace.cjs`
 * держит тот же закрытый список. Свободный текст причиной не является: список закрыт именно
 * потому, что каждая запись называет РАЗНЫЙ ремонт.
 *
 * ─── ЮРИДИЧЕСКАЯ РАМКА (исполняемая, а не только описанная) ────────────────────────────────────
 * Снимаются ЗАКОНОМЕРНОСТИ, а не ЗНАЧЕНИЯ: шаг сетки отступов, шкала кеглей, число уровней
 * иерархии, число полей формы, длина последовательности экранов. «Отступ 8px встречается 137 раз»
 * — измерение; «именно этот фиолетовый» — чужое оформление.
 *   • CSS-файлы и DOM чужого сайта — чужой код под авторским правом. По умолчанию НЕ сохраняются
 *     (`--keep-dom` сохраняет, печатая предупреждение). Основанием для измерения они быть могут,
 *     копированием в свой продукт — нет.
 *   • Логотип, название и фирменные цвета В СВЯЗКЕ — товарные знаки. Инструмент не выпускает строк
 *     оси «облик» и не предлагает палитру к переносу.
 *   • Каталог доказательств помечается как чужой материал и закрывается собственным `.gitignore`.
 *   • Обход более ОДНОЙ страницы читает `robots.txt` цели. Запрет — это исход `robots-disallowed`,
 *     а не препятствие: обходить запрет нечем и незачем.
 *   • Аутентификация и любой обход технических ограничений сайта ЗАПРЕЩЕНЫ. Экран входа —
 *     законная последняя точка пути: он записывается как шаг и обход останавливается.
 *   • User-Agent честный: к штатному дописывается токен инструмента. Маскировка под обычный
 *     браузер была бы обходом защиты.
 *
 * ─── ОПОРА НА УСТОЙЧИВОЕ ───────────────────────────────────────────────────────────────────────
 * Всё измеряется по ВЫЧИСЛЕННЫМ стилям и СЕМАНТИЧЕСКИМ ролям (aria, теги форм, доступные имена).
 * Имена классов вида `sx-ds2y8i` не читаются НИГДЕ: у сборщиков они меняются каждой сборкой чужого
 * сайта, и опора на них — это тест, который краснеет от чужого релиза. По той же причине имена
 * переменных дизайн-системы не выписываются: у сборщиков они обфусцированы, содержательно только их
 * ЧИСЛО.
 *
 * ─── ВЕЖЛИВОСТЬ ────────────────────────────────────────────────────────────────────────────────
 * Один поток, пауза между страницами (`--delay-ms`, по умолчанию 1500), жёсткий потолок числа
 * страниц (`--max-pages`, по умолчанию 5, потолок 12). Учащение запросов повышает шанс блокировки
 * и просто невежливо.
 *
 * ─── ВНЕШНЕЕ ПРЕДУСЛОВИЕ ───────────────────────────────────────────────────────────────────────
 * Playwright — ВНЕШНЕЕ предусловие, ровно как браузерный MCP у `clone-website`. У пакета
 * `p-replicator` НЕТ зависимостей, и эта утилита их не заводит: модуль ищется на машине во время
 * запуска, а его отсутствие — это честный исход `no-browser`, а не падение.
 *   npm i -D playwright && npx playwright install chromium
 *   либо укажите путь явно: PLAYWRIGHT_MODULE=/путь/к/node_modules/playwright
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { execFileSync } = require('node:child_process');

/** Закрытый список причин. Совпадает с REASONS в check-look-trace.cjs — один список на два файла. */
const REASONS = ['no-browser', 'robots-disallowed', 'bot-protected', 'auth-required', 'timeout',
  'unreachable', 'out-of-scope'];

const UA_TOKEN = 'p-replicator-path-capture/1 (+recon; robots-respecting)';
const ROBOTS_AGENT = 'p-replicator-path-capture';
const PROFILE = path.join('docs', 'source-product-profile.md');
const DEFAULT_OUT = path.join('.p-replicator', 'source-path-capture');
const MAX_PAGES_CAP = 12;
const MIN_DELAY_MS = 250;

function say(s) { process.stdout.write(s + '\n'); }

/** НЕ ИЗМЕРЕНО. Единственная дверь к коду 2, и она всегда называет причину из закрытого списка. */
function notMeasured(reason, detail, hint) {
  if (!REASONS.includes(reason)) {
    // Обязанность закрытого списка держится кодом, а не дисциплиной вызывающего.
    say('⚠️  внутренняя ошибка: причина «' + reason + '» вне закрытого списка ' + REASONS.join(' | '));
    process.exit(2);
  }
  say('⚠️  НЕ ИЗМЕРЕНО: ' + reason);
  if (detail) say('    ' + detail);
  say('');
  say('    В docs/source-product-profile.md запишите ось «путь» как НЕ ИЗМЕРЕНО:');
  say('      **Статус съёмки (путь):** НЕ ИЗМЕРЕНО');
  say('      **Причина (путь):** ' + reason);
  say('    Закрытый список причин: ' + REASONS.join(' | '));
  if (hint) { say(''); say('    ' + hint); }
  process.exit(2);
}

// ───────────────────────────────────────────────────────────────────────────── аргументы

function parseArgs(argv) {
  const opts = {
    url: null, maxPages: 5, delayMs: 1500, timeoutMs: 20000, out: DEFAULT_OUT,
    project: '.', follow: [], json: false, keepDom: false, fullPage: false,
    viewport: { width: 1440, height: 900 },
  };
  const num = (v, name) => {
    const n = Number(v);
    if (!Number.isFinite(n)) notMeasured('out-of-scope', name + ' не число: ' + v);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max-pages') opts.maxPages = num(argv[++i], '--max-pages');
    else if (a === '--delay-ms') opts.delayMs = num(argv[++i], '--delay-ms');
    else if (a === '--timeout-ms') opts.timeoutMs = num(argv[++i], '--timeout-ms');
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--project') opts.project = argv[++i];
    else if (a === '--follow') opts.follow = String(argv[++i] || '').split('|').map((s) => s.trim()).filter(Boolean);
    else if (a === '--width') opts.viewport.width = num(argv[++i], '--width');
    else if (a === '--json') opts.json = true;
    else if (a === '--keep-dom') opts.keepDom = true;
    else if (a === '--full-page') opts.fullPage = true;
    else if (a === '--help' || a === '-h') { usage(); process.exit(0); }
    else if (a.startsWith('-')) notMeasured('out-of-scope', 'неизвестный флаг: ' + a);
    else if (opts.url === null) opts.url = a;
    else notMeasured('out-of-scope', 'лишний позиционный аргумент: ' + a);
  }
  if (!opts.url) { usage(); notMeasured('out-of-scope', 'не назван URL стартового экрана'); }

  let u;
  try { u = new URL(opts.url); } catch { notMeasured('out-of-scope', 'неразбираемый URL: ' + opts.url); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    notMeasured('out-of-scope', 'схема ' + u.protocol + ' вне области инструмента — только http(s)');
  }
  opts.start = u;

  // Потолки — вежливость, а не совет. Превышение зажимается ВСЛУХ, никогда молча.
  if (opts.maxPages > MAX_PAGES_CAP) {
    say('ℹ️  --max-pages ' + opts.maxPages + ' зажат до потолка вежливости ' + MAX_PAGES_CAP);
    opts.maxPages = MAX_PAGES_CAP;
  }
  if (opts.maxPages < 1) notMeasured('out-of-scope', '--max-pages меньше 1');
  if (opts.delayMs < MIN_DELAY_MS) {
    say('ℹ️  --delay-ms ' + opts.delayMs + ' поднят до минимума вежливости ' + MIN_DELAY_MS);
    opts.delayMs = MIN_DELAY_MS;
  }
  return opts;
}

function usage() {
  say('capture-source-path.cjs <url> [опции]   — снять ось «путь» Фазы 0.5');
  say('  --max-pages N    сколько экранов пройти (по умолчанию 5, потолок ' + MAX_PAGES_CAP + ')');
  say('  --delay-ms N     пауза между экранами (по умолчанию 1500, минимум ' + MIN_DELAY_MS + ')');
  say('  --timeout-ms N   бюджет одной навигации (по умолчанию 20000)');
  say('  --follow "A|B"   доступные ИМЕНА призывов, по которым идти (иначе — по заметности)');
  say('  --out DIR        каталог доказательств (по умолчанию ' + DEFAULT_OUT + ')');
  say('  --project DIR    корень проекта, откуда читается профиль (по умолчанию .)');
  say('  --width N        ширина окна (по умолчанию 1440)');
  say('  --json           машинный вывод вместо таблицы');
  say('  --full-page      скриншот всей страницы, а не окна');
  say('  --keep-dom       сохранить DOM (чужой код — по умолчанию НЕ сохраняется)');
}

// ───────────────────────────────────────────────────────────────────────────── playwright

/**
 * Playwright ищется на машине, а не в зависимостях пакета. Порядок кандидатов ЯВНЫЙ, и каждый
 * промах называется — «не нашли» без списка того, где искали, нечинимо.
 */
function resolvePlaywright() {
  const tried = [];
  const candidates = [];
  if (process.env.PLAYWRIGHT_MODULE) candidates.push(process.env.PLAYWRIGHT_MODULE);
  for (const name of ['playwright', 'playwright-core']) {
    candidates.push(name);
    candidates.push(path.resolve(process.cwd(), 'node_modules', name));
  }
  let globalRoot = null;
  try { globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', timeout: 15000 }).trim(); }
  catch { /* npm может отсутствовать — это не ошибка, просто минус один кандидат */ }
  if (globalRoot) for (const name of ['playwright', 'playwright-core']) candidates.push(path.join(globalRoot, name));

  for (const c of candidates) {
    tried.push(c);
    try {
      const mod = require(c);
      if (mod && mod.chromium) return { mod, from: c };
    } catch { /* следующий кандидат */ }
  }
  notMeasured('no-browser',
    'модуль playwright не найден; искали: ' + tried.join(', '),
    'Playwright — ВНЕШНЕЕ предусловие (у пакета ноль зависимостей):\n'
    + '      npm i -D playwright && npx playwright install chromium\n'
    + '    либо PLAYWRIGHT_MODULE=/путь/к/node_modules/playwright');
  return null;
}

// ───────────────────────────────────────────────────────────────────────────── robots.txt

/** Загрузить текст по URL без зависимостей. Возвращает {status, body} либо бросает. */
function fetchText(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get(url, {
      timeout: timeoutMs,
      headers: { 'user-agent': UA_TOKEN, accept: 'text/plain,*/*' },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => { if (chunks.length < 512) chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => { req.destroy(new Error('robots.txt timeout')); });
    req.on('error', reject);
  });
}

/**
 * Разбор robots.txt под наш агент. Группа выбирается по нашему токену, иначе `*`.
 * Совпадение — по длиннейшему префиксу; при равной длине Allow побеждает Disallow (RFC 9309).
 */
function parseRobots(text) {
  const groups = new Map();
  let current = [];
  let inGroup = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') {
      if (!inGroup) { current = []; inGroup = true; }
      const key = value.toLowerCase();
      if (!groups.has(key)) groups.set(key, current);
      else current = groups.get(key);
      groups.set(key, current);
    } else if (field === 'allow' || field === 'disallow') {
      inGroup = false;
      current.push({ allow: field === 'allow', pattern: value });
    }
  }
  const agent = ROBOTS_AGENT.toLowerCase();
  let rules = null;
  for (const [key, value] of groups) {
    if (agent.startsWith(key) && key !== '*') { rules = value; break; }
  }
  if (!rules) rules = groups.get('*') || [];
  return rules;
}

function robotsAllows(rules, pathname) {
  let best = null;
  for (const rule of rules) {
    if (rule.pattern === '') continue;              // пустой Disallow = разрешено всё
    const re = patternToRegExp(rule.pattern);
    if (!re || !re.test(pathname)) continue;
    const len = rule.pattern.length;
    if (!best || len > best.len || (len === best.len && rule.allow)) best = { len, allow: rule.allow };
  }
  return best ? best.allow : true;
}

function patternToRegExp(pattern) {
  let out = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') out += '.*';
    else if (ch === '$' && i === pattern.length - 1) out += '$';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  try { return new RegExp(out); } catch { return null; }
}

/**
 * Обход более ОДНОЙ страницы обязан спросить robots.txt.
 *   404/410/403 → правил не опубликовано → можно (стандартная трактовка);
 *   5xx / сеть  → правила НЕ ПРОЧИТАНЫ → нельзя. Нечитаемый robots.txt трактуется как запрет:
 *                 «мы не смогли спросить» не то же самое, что «нам разрешили».
 */
async function robotsGate(start, maxPages, timeoutMs) {
  if (maxPages <= 1) {
    return { checked: false, note: 'одна страница — robots.txt не запрашивался (обхода нет)' };
  }
  const url = new URL('/robots.txt', start.origin);
  let res;
  try { res = await fetchText(url, timeoutMs); } catch (e) {
    notMeasured('robots-disallowed',
      'robots.txt не прочитан (' + ((e && e.message) || e) + ') — нечитаемый robots.txt трактуется как запрет',
      'снимите ОДНУ страницу (--max-pages 1): обход одной страницы robots.txt не регулирует');
  }
  if (res.status >= 500) {
    notMeasured('robots-disallowed',
      'robots.txt отдал ' + res.status + ' — правила не прочитаны, трактуется как запрет',
      'повторите позже либо снимите одну страницу (--max-pages 1)');
  }
  if (res.status >= 400) {
    return { checked: true, note: 'robots.txt отсутствует (HTTP ' + res.status + ') — правил не опубликовано', rules: [] };
  }
  const rules = parseRobots(res.body);
  if (!robotsAllows(rules, start.pathname)) {
    notMeasured('robots-disallowed',
      'robots.txt запрещает ' + start.pathname + ' для агента ' + ROBOTS_AGENT,
      'запрет — это исход, а не препятствие: обходить его нечем и незачем');
  }
  return { checked: true, note: 'robots.txt прочитан, стартовый путь разрешён', rules };
}

// ───────────────────────────────────────────────────────────────────────────── измерение экрана

/** Выполняется В СТРАНИЦЕ. Только вычисленные стили и семантические роли — никаких имён классов. */
function measureInPage() {
  const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n) : null; };
  const bump = (m, k) => { if (k === null || k === undefined || k === '') return; m[k] = (m[k] || 0) + 1; };
  const fontSizes = {}; const weights = {}; const spacing = {}; const radii = {}; const colors = {};
  let counted = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (counted >= 4000) break;
    if (!el.getClientRects().length) continue;      // невидимое к облику не относится
    counted++;
    const cs = getComputedStyle(el);
    bump(fontSizes, px(cs.fontSize));
    bump(weights, cs.fontWeight);
    for (const p of ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
      'marginTop', 'marginBottom', 'rowGap', 'columnGap']) {
      const v = px(cs[p]); if (v) bump(spacing, v);
    }
    const rad = px(cs.borderTopLeftRadius); if (rad) bump(radii, rad);
    const bg = cs.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') bump(colors, bg);
  }
  let rootVars = 0;
  try {
    const rs = getComputedStyle(document.documentElement);
    for (let i = 0; i < rs.length; i++) if (String(rs[i]).startsWith('--')) rootVars++;
  } catch (e) { rootVars = -1; }

  const breakpoints = {}; let sheets = 0; let unreadable = 0;
  const walkRules = (list) => {
    for (const r of list) {
      if (r.conditionText) {
        const found = String(r.conditionText).match(/(\d+(?:\.\d+)?)px/g) || [];
        for (const f of found) bump(breakpoints, Math.round(parseFloat(f)));
      }
      if (r.cssRules) { try { walkRules(r.cssRules); } catch (e) { /* вложенный cross-origin */ } }
    }
  };
  for (const sheet of document.styleSheets) {
    sheets++;
    let rules = null;
    try { rules = sheet.cssRules; } catch (e) { unreadable++; continue; }
    if (!rules) { unreadable++; continue; }
    try { walkRules(rules); } catch (e) { unreadable++; }
  }

  const headings = [];
  for (const h of document.querySelectorAll('h1,h2,h3,h4')) {
    if (headings.length >= 24) break;
    const text = (h.textContent || '').trim().replace(/\s+/g, ' ');
    if (text) headings.push({ level: Number(h.tagName.slice(1)), text: text.slice(0, 80) });
  }

  const ctas = [];
  for (const el of document.querySelectorAll('a[href],button,[role="button"],input[type="submit"]')) {
    if (ctas.length >= 60) break;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const name = (el.getAttribute('aria-label') || el.value || el.textContent || '')
      .trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!name) continue;
    ctas.push({
      name,
      href: el.getAttribute('href') || null,
      tag: el.tagName.toLowerCase(),
      area: Math.round(r.width * r.height),
      top: Math.round(r.top + window.scrollY),
      weight: Number(cs.fontWeight) || 400,
      filled: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent',
      aboveFold: r.top >= 0 && r.top < window.innerHeight,
    });
  }

  const fields = [];
  for (const el of document.querySelectorAll('input,select,textarea')) {
    if (fields.length >= 30) break;
    const type = String(el.type || el.tagName).toLowerCase();
    if (type === 'hidden') continue;
    let label = el.getAttribute('aria-label') || '';
    if (!label && el.labels && el.labels[0]) label = el.labels[0].textContent || '';
    if (!label) label = el.getAttribute('placeholder') || el.getAttribute('name') || '';
    fields.push({ type, label: String(label).trim().replace(/\s+/g, ' ').slice(0, 60) });
  }

  return {
    title: document.title || '',
    fontSizes, weights, spacing, radii, colors, rootVars, breakpoints, sheets, unreadable,
    headings, ctas, fields,
    authWall: fields.some((f) => f.type === 'password'),
    elements: counted,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  };
}

// ───────────────────────────────────────────────────────────────────────────── закономерности

/**
 * Шаг сетки отступов — НАИБОЛЬШИЙ делитель, на который делится не меньше SHARE массы отступов.
 *
 * НОД здесь НЕ годится, и это измерено: у браузера свои умолчания в `em` (у `h1` при кегле 56px
 * margin выходит 38px), и ОДНО такое значение обнуляет НОД до 1 или 2 на сайте с честной сеткой в
 * 4px. Доля устойчива к чужим умолчаниям, а порог 0.9 отделяет настоящий шаг от его кратного:
 * на пробе с 8/12/16/20/24 доля для 4 = 0.91, для 8 = 0.73, и шагом называется 4.
 *
 * Возвращается и сама доля: «шаг 4px, доля 0.91» проверяемо, «шаг 4px» — нет.
 */
const SPACING_SHARE = 0.9;

function spacingStep(hist) {
  const entries = Object.entries(hist).map(([v, c]) => [Number(v), c]).filter(([v]) => v > 0);
  const mass = entries.reduce((t, [, c]) => t + c, 0);
  if (mass < 4) return null;
  for (let d = 24; d >= 2; d--) {
    const hit = entries.reduce((t, [v, c]) => t + (v % d === 0 ? c : 0), 0);
    if (hit / mass >= SPACING_SHARE) return { step: d, share: Math.round((hit / mass) * 100) / 100 };
  }
  return null;
}

function topN(hist, n) {
  return Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => ({ value: k, count: v }));
}

function regularities(m) {
  const sizes = Object.keys(m.fontSizes).map(Number).sort((a, b) => a - b);
  return {
    spacingStep: spacingStep(m.spacing),
    spacingTop: topN(m.spacing, 6),
    typeScale: sizes,
    typeLevels: sizes.length,
    weights: Object.keys(m.weights).map(Number).sort((a, b) => a - b),
    radii: Object.keys(m.radii).map(Number).sort((a, b) => a - b),
    distinctColors: Object.keys(m.colors).length,
    rootVars: m.rootVars,
    breakpoints: Object.keys(m.breakpoints).map(Number).sort((a, b) => a - b),
    stylesheets: { total: m.sheets, unreadable: m.unreadable },
    headingLevels: [...new Set(m.headings.map((h) => h.level))].sort((a, b) => a - b).length,
    ctaCount: m.ctas.length,
    prominentCtas: m.ctas.filter((c) => c.filled && c.aboveFold).length,
    fieldCount: m.fields.length,
  };
}

// ───────────────────────────────────────────────────────────────────────────── выбор перехода

/**
 * Следующий шаг выбирается по УСТОЙЧИВЫМ признакам: доступное имя, тот же источник, заметность
 * (залитый фон + первый экран + площадь). Имена классов не читаются вовсе.
 */
function pickNext(measure, currentUrl, visited, follow) {
  const sameOrigin = [];
  for (const c of measure.ctas) {
    if (!c.href) continue;
    let u;
    try { u = new URL(c.href, currentUrl); } catch { continue; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    if (u.origin !== new URL(currentUrl).origin) continue;
    u.hash = '';
    const key = u.toString();
    if (visited.has(key)) continue;
    sameOrigin.push({ ...c, url: key });
  }
  if (!sameOrigin.length) return null;
  if (follow.length) {
    for (const want of follow) {
      const hit = sameOrigin.find((c) => c.name.toLowerCase().includes(want.toLowerCase()));
      if (hit) return hit;
    }
  }
  const score = (c) => (c.filled ? 1000 : 0) + (c.aboveFold ? 500 : 0) + Math.min(c.area, 400)
    + (c.weight >= 500 ? 100 : 0) + (c.tag === 'button' ? 50 : 0);
  return sameOrigin.sort((a, b) => score(b) - score(a))[0];
}

// ───────────────────────────────────────────────────────────────────────────── строки FR-LOOK

/** Продолжить нумерацию СУЩЕСТВУЮЩЕГО профиля. Одно семейство — значит один счётчик. */
function nextId(projectRoot) {
  const abs = path.join(projectRoot, PROFILE);
  let max = 0;
  try {
    const text = fs.readFileSync(abs, 'utf8');
    for (const m of text.matchAll(/\bFR-LOOK-(\d{3})\b/g)) max = Math.max(max, Number(m[1]));
    return { next: max + 1, profileFound: true };
  } catch { return { next: 1, profileFound: false }; }
}

const cell = (s) => String(s).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const id = (n) => 'FR-LOOK-' + String(n).padStart(3, '0');

function stepRow(n, step, total, evidenceName) {
  const r = step.regularities;
  const parts = ['Шаг ' + step.index + ' из ' + total];
  parts.push(step.index === 1 ? 'стартовый экран' : 'достижим одним действием с предыдущего');
  parts.push('полей формы: ' + r.fieldCount);
  parts.push('заметных призывов: ' + r.prominentCtas + ' из ' + r.ctaCount);
  parts.push('уровней заголовков: ' + r.headingLevels);
  if (step.authWall) parts.push('это экран входа — путь дальше за аутентификацией, не снимается');
  return '| ' + id(n) + ' | ' + cell(parts.join('; ')) + ' | путь | ' + cell(step.path)
    + ' | прокликано ' + step.at + ', ' + evidenceName + ' | ЧЕРНОВИК |';
}

function sequenceRow(n, steps) {
  const chain = steps.map((s) => s.path).join(' → ');
  const text = 'Последовательность экранов до конца снятого пути: ' + steps.length + ' экрана(ов), '
    + chain + (steps[steps.length - 1].authWall ? '; путь упирается в экран входа' : '');
  return '| ' + id(n) + ' | ' + cell(text) + ' | путь | ' + cell(steps[0].path)
    + ' | прокликано ' + steps[0].at + ', capture.json | ЧЕРНОВИК |';
}

// ───────────────────────────────────────────────────────────────────────────── обход

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function classifyNavError(err) {
  const msg = String((err && err.message) || err);
  if (/Timeout|timeout|exceeded/.test(msg)) return 'timeout';
  if (/ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_INTERNET|ENOTFOUND|ECONNREFUSED|net::/.test(msg)) return 'unreachable';
  return 'unreachable';
}

async function run(opts) {
  const { mod, from } = resolvePlaywright();
  say('ℹ️  playwright: ' + from);

  const robots = await robotsGate(opts.start, opts.maxPages, opts.timeoutMs);
  say('ℹ️  ' + robots.note);

  const outDir = path.resolve(opts.project, opts.out);
  fs.mkdirSync(outDir, { recursive: true });
  // Каталог держит ЧУЖОЙ материал. Он не попадает в git по собственному .gitignore, а не по чужой
  // дисциплине: правило, которое надо помнить, — самый слабый слой лестницы обнаружения.
  fs.writeFileSync(path.join(outDir, '.gitignore'), '*\n');
  fs.writeFileSync(path.join(outDir, 'README.txt'),
    'Материал ЧУЖОГО сайта: скриншоты и семантические слепки, снятые для ИЗМЕРЕНИЯ.\n'
    + 'Основание для измерения закономерностей — да. Копирование в свой продукт — нет.\n'
    + 'Каталог закрыт собственным .gitignore и не коммитится.\n');

  const launchArgs = [];
  // Под суперпользователем chromium не стартует без --no-sandbox. Это условие окружения (VPS,
  // контейнер), а не обход чужой защиты.
  if (typeof process.getuid === 'function' && process.getuid() === 0) launchArgs.push('--no-sandbox');

  let browser = null;
  try {
    browser = await mod.chromium.launch({ args: launchArgs });
  } catch (e) {
    notMeasured('no-browser', 'браузер не запустился: ' + ((e && e.message) || e),
      'бинарь браузера ставится отдельно: npx playwright install chromium');
  }

  const steps = [];
  let outcome = null;
  try {
    let defaultUa = '';
    try {
      const probe = await browser.newPage();
      defaultUa = await probe.evaluate(() => navigator.userAgent);
      await probe.close();
    } catch { /* UA останется без штатной части — не критично */ }
    const context = await browser.newContext({
      viewport: opts.viewport,
      userAgent: (defaultUa ? defaultUa + ' ' : '') + UA_TOKEN,
    });
    const page = await context.newPage();

    const visited = new Set();
    let target = opts.start.toString();
    let arrivedBy = null;

    for (let i = 1; i <= opts.maxPages; i++) {
      if (i > 1) await sleep(opts.delayMs);

      const targetUrl = new URL(target);
      if (robots.checked && robots.rules && !robotsAllows(robots.rules, targetUrl.pathname)) {
        say('ℹ️  ' + targetUrl.pathname + ' закрыт robots.txt — обход остановлен здесь, это не ошибка');
        break;
      }

      let response;
      try {
        response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs });
      } catch (e) {
        const reason = classifyNavError(e);
        if (i === 1) {
          notMeasured(reason, 'стартовый экран не открылся: ' + ((e && e.message) || e),
            reason === 'timeout' ? 'поднимите --timeout-ms либо возьмите более лёгкий экран' : null);
        }
        say('ℹ️  шаг ' + i + ' не открылся (' + reason + ') — путь снят до этого места');
        break;
      }

      const status = response ? response.status() : 0;
      if (status === 403 || status === 429) {
        if (i === 1) {
          notMeasured('bot-protected', 'сайт ответил HTTP ' + status + ' на стартовом экране',
            'обходить защиту от ботов ЗАПРЕЩЕНО; это исход, а не препятствие');
        }
        say('ℹ️  шаг ' + i + ': HTTP ' + status + ' — путь снят до этого места');
        break;
      }
      if (status >= 400) {
        if (i === 1) notMeasured('unreachable', 'стартовый экран ответил HTTP ' + status);
        say('ℹ️  шаг ' + i + ': HTTP ' + status + ' — путь снят до этого места');
        break;
      }

      // Тишина сети — попытка, а не обязанность: у тяжёлого лендинга её может не быть вовсе.
      try { await page.waitForLoadState('networkidle', { timeout: Math.min(8000, opts.timeoutMs) }); }
      catch { /* хватит domcontentloaded */ }

      const finalUrl = new URL(page.url());
      finalUrl.hash = '';
      visited.add(finalUrl.toString());

      const measure = await page.evaluate(measureInPage);

      if (measure.authWall && i === 1) {
        notMeasured('auth-required', 'стартовый экран уже за входом (поле пароля на первом экране)',
          'аутентификация и любой обход технических ограничений сайта ЗАПРЕЩЕНЫ');
      }

      const at = new Date().toISOString().slice(0, 19) + 'Z';
      const base = 'step-' + String(i).padStart(2, '0');
      try {
        await page.screenshot({ path: path.join(outDir, base + '.png'), fullPage: opts.fullPage });
      } catch { /* скриншот — доказательство, а не условие съёмки */ }
      let aria = '';
      try {
        if (typeof page.locator('body').ariaSnapshot === 'function') {
          aria = await page.locator('body').ariaSnapshot();
        } else if (page.accessibility) {
          aria = JSON.stringify(await page.accessibility.snapshot(), null, 1);
        }
      } catch { /* семантический слепок отсутствует — записываем пустым, не выдумываем */ }
      fs.writeFileSync(path.join(outDir, base + '.aria.txt'), aria || '(семантический слепок недоступен)\n');
      if (opts.keepDom) {
        say('⚠️  --keep-dom: DOM чужого сайта сохраняется. Это ЧУЖОЙ код под авторским правом — '
          + 'основание для измерения, не материал для копирования.');
        fs.writeFileSync(path.join(outDir, base + '.dom.html'), await page.content());
      }

      steps.push({
        index: i,
        url: finalUrl.toString(),
        path: finalUrl.pathname + (finalUrl.search || ''),
        status,
        title: measure.title,
        arrivedBy,
        authWall: measure.authWall,
        at,
        evidence: { screenshot: base + '.png', aria: base + '.aria.txt' },
        regularities: regularities(measure),
        headings: measure.headings.slice(0, 8),
        fields: measure.fields,
      });

      if (measure.authWall) {
        say('ℹ️  шаг ' + i + ' — экран входа. Останавливаемся: за вход не ходим, это законная '
          + 'последняя точка пути.');
        break;
      }

      const next = pickNext(measure, finalUrl.toString(), visited, opts.follow);
      if (!next) break;
      target = next.url;
      arrivedBy = next.name;
    }
  } finally {
    try { await browser.close(); } catch { /* закрыли как смогли */ }
  }

  if (!steps.length) {
    // Сюда попадает только то, что не отсеклось причинами выше.
    notMeasured('unreachable', 'ни одного экрана снять не удалось');
  }

  fs.writeFileSync(path.join(outDir, 'capture.json'), JSON.stringify({
    tool: 'capture-source-path.cjs',
    start: opts.start.toString(),
    at: new Date().toISOString(),
    robots: robots.note,
    politeness: { maxPages: opts.maxPages, delayMs: opts.delayMs, threads: 1 },
    steps,
  }, null, 2));

  if (steps.length === 1) {
    outcome = 'no-source';
    say('');
    say('📄 ИСТОЧНИКА НЕТ (для оси «путь»): источник ОТКРЫЛСЯ, но перехода со стартового экрана нет.');
    say('   Это доказанный отрицательный ответ — мы посмотрели, — а не слепота.');
    say('   Запишите в docs/source-product-profile.md:');
    say('     **Статус съёмки (путь):** ИСТОЧНИКА НЕТ');
    if (opts.json) say(JSON.stringify({ outcome, steps }, null, 2));
    return 1;
  }

  outcome = 'captured';
  const { next, profileFound } = nextId(opts.project);
  const rows = [];
  let n = next;
  for (const s of steps) rows.push(stepRow(n++, s, steps.length, s.evidence.aria));
  rows.push(sequenceRow(n++, steps));

  if (opts.json) {
    say(JSON.stringify({ outcome, firstId: id(next), rows, steps }, null, 2));
    return 0;
  }

  say('');
  say('✅ СНЯТ: ось «путь», ' + steps.length + ' экрана(ов). Доказательства: ' + outDir);
  if (!profileFound) {
    say('⚠️  ' + PROFILE + ' не найден — нумерация начата с 001. Если профиль уже есть в другом '
      + 'каталоге, укажите --project, иначе номера разойдутся.');
  }
  say('');
  say('Вставьте в таблицу-семя `## 🎨 Look Requirements Seed` (строки ЧЕРНОВИК, проверьте их):');
  say('');
  for (const r of rows) say(r);
  say('');
  say('Формулировки — ЗАКОНОМЕРНОСТИ (сколько экранов, сколько полей, сколько уровней), а не');
  say('ЗНАЧЕНИЯ чужого оформления. Уточняя строку руками, держитесь той же границы.');
  // Сводка берётся со СТАРТОВОГО экрана, а не с последнего: дизайн-система объявляется на входе,
  // а последним шагом часто оказывается экран входа — самый бедный на разметку из всех снятых.
  const r0 = steps[0].regularities;
  say('');
  say('Замеренные закономерности СТАРТОВОГО экрана (материал для оси «облик», строк не выпускаем):');
  say('  шаг сетки отступов: ' + (r0.spacingStep === null ? 'не выводится'
    : r0.spacingStep.step + 'px (доля ' + r0.spacingStep.share + ')')
    + ' · кеглей: ' + r0.typeLevels
    + ' · начертаний: ' + r0.weights.length
    + ' · радиусов: ' + r0.radii.length
    + ' · переменных в :root: ' + r0.rootVars);
  say('  брейкпоинты из настоящих @media: ' + (r0.breakpoints.join(', ') || 'не прочитаны')
    + ' (таблиц стилей ' + r0.stylesheets.total + ', из них закрыты cross-origin: '
    + r0.stylesheets.unreadable + ')');
  say('  Имена классов и имена переменных НЕ читались: у сборщиков они меняются каждой сборкой.');
  return 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const code = await run(opts);
  process.exit(code);
}

/**
 * Чистые половины вынесены наружу НАМЕРЕННО: разбор robots.txt, вывод шага сетки, нумерация и
 * формат строк проверяются детерминированно и БЕЗ браузера — слой 1 лестницы обнаружения. Оставь
 * их внутри — и единственным способом их проверить стал бы живой прогон, то есть проверка,
 * молчащая ровно там, где браузера нет.
 */
if (require.main === module) {
  main().catch((err) => {
    // Даже неожиданный отказ не должен читаться как «снято».
    notMeasured('out-of-scope', 'внутренняя ошибка съёмки: ' + String((err && err.stack) || err),
      'это дефект инструмента, а не ответ о продукте — почините вызов и повторите');
  });
} else {
  module.exports = {
    REASONS, MAX_PAGES_CAP, MIN_DELAY_MS, ROBOTS_AGENT, UA_TOKEN,
    parseRobots, robotsAllows, patternToRegExp, spacingStep, regularities,
    pickNext, nextId, stepRow, sequenceRow, resolvePlaywright,
  };
}
