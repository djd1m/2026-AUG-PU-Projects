#!/usr/bin/env node
'use strict';

/**
 * check-embed-contract.cjs — виджет проверяли на ЧУЖОЙ странице или на своей?
 *
 * NOT an event hook. Like `check-ports.cjs`, `check-look-trace.cjs`, `check-growth-trace.cjs`,
 * `check-docs-complete.cjs` and `check-swarm-receipts.cjs`, it lives here because this directory
 * already carries plain Node utilities; nothing registers it in settings.json. That is deliberate:
 * this package's hooks are NON-BLOCKING by contract (pinned by
 * tests/unit/hooks-project-anchored.test.js, which requires exit 0), so a hook could never refuse
 * anything — it could only print. Invoke it:
 *
 *   node .claude/hooks/check-embed-contract.cjs [path-to-project]
 *
 * WHY IT EXISTS — the failure, before the technology.
 *
 * When the product IS an embeddable widget (a review collector, a chat bubble), the widget runs on
 * SOMEONE ELSE'S page. Three failure classes then live entirely on that page, and every one of them
 * is INVISIBLE while you test on your own:
 *
 *   перекрёстный-запрос   the client's browser refuses your API call from a foreign origin
 *   протечка-стилей       the host page's CSS reaches into your widget (or yours into the host)
 *   политика-безопасности the host's Content-Security-Policy refuses to load your script at all
 *
 * The first and the third produce a client-side outage under a fully GREEN check at home, and the
 * mechanism is one sentence: THE CONDITIONS OF FAILURE BELONG TO THE HOST PAGE, AND YOU TESTED
 * YOURS. Same-origin removes the CORS preflight entirely; your own page ships no hostile CSS and no
 * restrictive CSP. "We opened our demo page and the widget rendered" is therefore not a weak check —
 * it is a check of a page on which none of the three failures CAN occur.
 *
 * This is the same shape as the measured deployment finding the package already carries: a check
 * must use the address the system ISSUED, never the one the checker already knows. A deployment
 * confirmed against localhost is confirmed against the one origin whose behaviour does not matter.
 *
 * WHAT THIS FILE CAN AND CANNOT DECIDE — read before trusting exit 0.
 *
 * It reads a DECLARATION, `docs/embed-contract.md`, and decides only what a declaration can settle:
 * that the proof names an origin the widget does not serve, that all three classes were answered,
 * and that the declared CORS pair is one the browser will actually accept. It does NOT open a
 * browser and does NOT prove the widget survives a hostile page. That half is layer 3/4 and the
 * rule `.claude/rules/embeddable-widget.md` says so in the same words.
 *
 * THE EXACT FORM OF `docs/embed-contract.md` — the rule `embeddable-widget.md` delegates it here on
 * purpose: this file is not part of the always-loaded corpus, so the long form costs nothing per
 * run, while the rule keeps only the decision the reader must carry.
 *
 *   **Встраиваемый виджет:** да                     (да | нет — `нет` is a legitimate answer)
 *   **Origin виджета:** https://widget.example.com
 *   **Origin хозяйской страницы:** http://localhost:8099
 *   **Учётные данные:** нет                          (да | нет — cookie / Authorization)
 *   **Разрешённые origin:** https://client-one.example
 *   **Проверка на чужой странице:** ВЫПОЛНЕНА        (ВЫПОЛНЕНА | НЕ ВЫПОЛНЕНА)
 *   **Причина:** —          (required when НЕ ВЫПОЛНЕНА; one of the closed REASONS below)
 *
 *   ## Классы отказа
 *
 *   | Класс | Статус | Признак у клиента | Лечение | Доказательство |
 *   |---|---|---|---|---|
 *   | перекрёстный-запрос | ПРОВЕРЕН | … | … | http://localhost:8099/host.html, 2026-09-01 |
 *   | протечка-стилей | ПРОВЕРЕН | … | … | http://localhost:8099/host.html, 2026-09-01 |
 *   | политика-безопасности | ПРОВЕРЕН | … | … | http://localhost:8099/host.html, 2026-09-01 |
 *
 * Exit codes — three, and the third is the point:
 *   0  all three classes answered, and every proof names a FOREIGN origin
 *   1  a defect is PROVEN and named: the proof is same-origin, a class went unanswered,
 *      a `ПРОВЕРЕН` row names no address, or the declared CORS pair is one browsers refuse
 *   2  THE CHECK DID NOT RUN — no contract, an unrecognised value, an unparseable origin, or the
 *      legitimate answers «продукт не встраивается» / «проверка НЕ ВЫПОЛНЕНА, причина такая-то»
 *
 * A checker that answers "clean" when it could not look converts an unknown into a reassurance —
 * which for this feature would be the exact client-side outage it exists to prevent.
 */

const fs = require('node:fs');
const path = require('node:path');

const CONTRACT = path.join('docs', 'embed-contract.md');

/** Does the product ship a widget onto foreign pages at all? A CLOSED set — `нет` is a legitimate
 *  answer and it exits 2, never 0: there is nothing to check, and «нечего проверять» must not be
 *  spelled the same way as «проверено». */
const EMBEDDABLE = { 'ДА': true, 'НЕТ': false };

/** Was the foreign-page check performed? CLOSED, and the negative answer is honest, not a failure:
 *  CFG-I4 of `honest-configuration` — an unreachable truth yields UNKNOWN, never a plausible value. */
const RUN_STATUS = { 'ВЫПОЛНЕНА': 'done', 'НЕ ВЫПОЛНЕНА': 'not-done' };

/**
 * Why a foreign-page check did not happen. CLOSED list — free text is not a reason here, because
 * the entire value of the list is that each entry names a DIFFERENT repair:
 *   no-host-page  — write the host fixture       · no-browser   — install the browser
 *   not-deployed  — deploy, then re-check        · out-of-scope — decide and record the decision
 */
const REASONS = ['no-host-page', 'no-browser', 'not-deployed', 'out-of-scope'];

/**
 * The three failure classes, as a CLOSED and MANDATORY set.
 *
 * Mandatory is the load-bearing half. Two classes answered out of three is not an unknown — it is a
 * PROVEN omission whose name we can print, exactly as a lost `FR-LOOK-nnn` row is. A widget that
 * survives the host's CSS and dies on the host's CSP does not work at the client.
 */
const CLASSES = ['перекрёстный-запрос', 'протечка-стилей', 'политика-безопасности'];

/** Per-class verdict. CLOSED: an unmapped spelling is refused and the recognised ones are printed,
 *  never silently read as one of them. */
const CLASS_STATUS = { 'ПРОВЕРЕН': 'checked', 'НЕ ПРОВЕРЕН': 'unchecked' };

const DEFAULT_PORT = { 'http:': '80', 'https:': '443', 'ws:': '80', 'wss:': '443' };

function say(s) { process.stdout.write(s + '\n'); }

/** Exit 2 with a reason. Never merged with "clean": not-run and not-violated are different facts. */
function cannotCheck(reason, hint) {
  say('⚠️  проверка НЕ выполнена: ' + reason);
  if (hint) say('    ' + hint);
  process.exit(2);
}

/** Exit 1 with the defect NAMED. A violation that cannot be named is a 2, not a 1. */
function proven(title, lines, tail) {
  say('❌ ' + title);
  for (const line of lines) say('   • ' + line);
  if (tail) say('   ' + tail);
  process.exit(1);
}

/**
 * The value of a `**Label:** value` header line, or null when the label is absent entirely.
 * An EMPTY value is returned as '' and is never collapsed into "absent" — those are different
 * mistakes with different repairs (`honest-configuration` CFG-I2).
 */
function header(text, label) {
  const re = new RegExp('^\\s*\\*\\*' + label + ':?\\*\\*\\s*:?(.*)$', 'im');
  const m = re.exec(text);
  return m ? m[1].trim().replace(/^[«"`]|[»"`]$/g, '').trim() : null;
}

/** A header value read against a CLOSED map, with both failure modes kept apart. */
function closedHeader(text, label, map, what) {
  const raw = header(text, label);
  if (raw === null) {
    cannotCheck('в контракте нет строки `**' + label + ':**`',
      what + ' — допустимы ровно: ' + Object.keys(map).join(' | '));
  }
  const key = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  if (!Object.prototype.hasOwnProperty.call(map, key)) {
    cannotCheck('нераспознанное значение `' + label + '`: ' + (key === '' ? '(пусто)' : key),
      'допустимы ровно: ' + Object.keys(map).join(' | '));
  }
  return map[key];
}

/**
 * scheme://host:port — the BROWSER'S own definition of "another site", and nothing looser.
 *
 * A different PORT is already a different origin: `http://localhost:3000` and `http://localhost:8099`
 * are foreign to each other, they do trigger a real CORS preflight, and that makes an honest host
 * fixture cheap to stand up locally. Host case and the default port are normalised so that
 * `https://Example.com:443` and `https://example.com` are not reported as two origins.
 *
 * Returns null when the text carries no absolute URL at all — the caller decides whether that is
 * "malformed" (exit 2) or "a claim with no address behind it" (exit 1); they are different facts.
 */
function originOf(text) {
  const m = /\b([a-z][a-z0-9+.-]*):\/\/[^\s|)<>"']+/i.exec(String(text || ''));
  const bare = /\bfile:\/\/\S*/i.exec(String(text || ''));
  if (!m && !bare) return null;
  let url;
  try { url = new URL((m || bare)[0]); } catch { return null; }
  const scheme = url.protocol.toLowerCase();
  if (scheme === 'file:') return { scheme, origin: 'file://', isFile: true, href: url.href };
  const port = url.port || DEFAULT_PORT[scheme] || '';
  return {
    scheme,
    origin: scheme + '//' + url.hostname.toLowerCase() + (port ? ':' + port : ''),
    isFile: false,
    href: url.href,
  };
}

/** One required origin header, refused three ways: absent, empty, or not a URL. */
function requiredOrigin(text, label, hint) {
  const raw = header(text, label);
  if (raw === null || raw === '') {
    cannotCheck('в контракте нет строки `**' + label + ':**` (или она пуста)', hint);
  }
  const parsed = originOf(raw);
  if (!parsed) {
    cannotCheck('`' + label + '` не разбирается как адрес: ' + raw,
      'нужен абсолютный адрес со схемой, например `https://widget.example.com` — '
      + 'origin это схема+хост+порт, и сравнивать можно только его');
  }
  return parsed;
}

/**
 * The failure-class table, as the contract records it.
 *
 * A row is a markdown table row whose FIRST cell is one of the three class names. The template
 * ships an example row, so a row whose evidence cell is still a bracketed placeholder is a TEMPLATE
 * row and is read as an EMPTY proof — never as a filled-in one.
 */
function classRows(text) {
  const rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    const name = (cells[1] || '').toLowerCase();
    if (!CLASSES.includes(name)) continue;
    const evidence = cells[5] || '';
    rows.push({
      name,
      status: (cells[2] || '').toUpperCase().replace(/\s+/g, ' ').trim(),
      treatment: cells[4] || '',
      evidence: /^\[.*\]$/.test(evidence) ? '' : evidence,
    });
  }
  return rows;
}

function main() {
  const root = process.argv[2] || '.';
  try { if (!fs.statSync(root).isDirectory()) cannotCheck('это не каталог: ' + root); }
  catch { cannotCheck('путь не существует: ' + root); }

  const abs = path.join(root, CONTRACT);
  let text;
  try {
    if (!fs.statSync(abs).isFile()) cannotCheck(CONTRACT + ' существует, но это не файл');
    text = fs.readFileSync(abs, 'utf-8');
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      cannotCheck('нет файла ' + CONTRACT,
        'это значит, что вопрос о встраивании НЕ ЗАДАВАЛСЯ — а НЕ что виджета нет; '
        + 'продукт без виджета отвечает `**Встраиваемый виджет:** нет`, и это законный ответ');
    }
    cannotCheck('не читается ' + CONTRACT + ': ' + ((e && e.message) || e));
  }

  // 1. Does the product embed at all? «нет» is legitimate and has nothing to check → 2.
  const embeddable = closedHeader(text, 'Встраиваемый виджет', EMBEDDABLE,
    'без этой строки нельзя отличить «виджета нет» от «про виджет забыли»');
  if (!embeddable) {
    cannotCheck('контракт говорит «Встраиваемый виджет: нет» — продукт не грузится на чужие страницы',
      'это законный ответ, а не нарушение; проверять нечего, поэтому не 0 и не 1');
  }

  // 2. Was the foreign-page check performed? A named refusal is honest and exits 2.
  const run = closedHeader(text, 'Проверка на чужой странице', RUN_STATUS,
    'без этой строки «не проверяли» неотличимо от «проверили»');
  if (run === 'not-done') {
    const raw = header(text, 'Причина');
    if (raw === null || raw === '') {
      cannotCheck('проверка НЕ ВЫПОЛНЕНА без строки `**Причина:**`',
        'причина обязательна и берётся из закрытого списка: ' + REASONS.join(' | ')
        + ' — каждая означает СВОЙ ремонт');
    }
    const picked = REASONS.filter((r) => new RegExp('(^|[^a-z-])' + r + '([^a-z-]|$)', 'i').test(raw));
    if (picked.length !== 1) {
      cannotCheck('причина «' + raw + '» не из закрытого списка (или названо сразу несколько)',
        'допустимы ровно: ' + REASONS.join(' | '));
    }
    cannotCheck('проверка на чужой странице НЕ ВЫПОЛНЕНА, причина: ' + picked[0],
      'честное «неизвестно», а не «виджет работает у клиента»; до закрытия причины виджет '
      + 'не проверен ни по одному из трёх классов отказа');
  }

  // 3. The two origins. Everything below is a comparison, so an unparseable address is a 2.
  const widget = requiredOrigin(text, 'Origin виджета',
    'откуда клиент грузит ваш скрипт — сравнивать не с чем, пока это не названо');
  const host = requiredOrigin(text, 'Origin хозяйской страницы',
    'на КАКОЙ чужой странице проверяли; своя демо-страница здесь и ловится');

  // 4. The whole point, and the cheapest deterministic bite in this file.
  if (host.isFile) {
    proven('проверка велась со страницы `file://` — это не условия клиента',
      ['`' + host.href + '`'],
      'у file:// origin равен null: браузер ведёт себя иначе и по CORS, и по CSP, так что такая '
      + 'страница не воспроизводит ни один из трёх классов отказа. Поднимите её по HTTP на ДРУГОМ '
      + 'порту — другой порт это уже другой origin.');
  }
  if (host.origin === widget.origin) {
    proven('проверка велась на СВОЁМ origin — это не проверка',
      ['origin виджета:            ' + widget.origin,
        'origin хозяйской страницы: ' + host.origin],
      'при совпадении origin предполётного запроса нет вовсе, чужой CSS отсутствует и чужой CSP '
      + 'не применяется — то есть НИ ОДИН из трёх классов отказа не может проявиться. Нужна '
      + 'страница другого origin: достаточно другого порта.');
  }

  // 5. The CORS pair the browser itself refuses. Declared, therefore checkable — and it is the one
  //    CORS defect that needs no server access to prove: with credentials, `*` is not a legal
  //    Access-Control-Allow-Origin, so the request fails at the client and nowhere else.
  const credentials = closedHeader(text, 'Учётные данные', { 'ДА': true, 'НЕТ': false },
    'шлёт ли виджет cookie/Authorization на ваш сервер');
  const allowed = header(text, 'Разрешённые origin');
  if (allowed === null || allowed === '') {
    cannotCheck('в контракте нет строки `**Разрешённые origin:**` (или она пуста)',
      'список origin хозяев, которым сервер отвечает, либо `*`');
  }
  if (credentials && /(^|[\s,])\*([\s,]|$)/.test(allowed)) {
    proven('объявлена пара, которую браузер отвергает сам',
      ['Учётные данные: да', 'Разрешённые origin: ' + allowed],
      '`Access-Control-Allow-Origin: *` несовместим с `credentials` по спецификации: браузер '
      + 'отклоняет ответ у клиента, а у вас на своём сайте запрос и не был перекрёстным. '
      + 'Отвечайте КОНКРЕТНЫМ origin хозяина из явного списка.');
  }

  // 6. All three classes, each answered, each proof naming a foreign address.
  const rows = classRows(text);
  const seen = rows.map((r) => r.name);
  const dupes = [...new Set(seen.filter((n, i) => seen.indexOf(n) !== i))];
  if (dupes.length) {
    cannotCheck('в таблице классов повторяются строки: ' + dupes.join(', '),
      'один класс — одна строка; иначе один зачёт закрывает сразу два разных вопроса');
  }
  const bad = rows.filter((r) => !Object.prototype.hasOwnProperty.call(CLASS_STATUS, r.status));
  if (bad.length) {
    cannotCheck('нераспознанный статус класса: '
      + bad.map((r) => r.name + ' → ' + (r.status || '(пусто)')).join(', '),
      'допустимы ровно: ' + Object.keys(CLASS_STATUS).join(' | '));
  }

  const missing = CLASSES.filter((c) => !seen.includes(c));
  if (missing.length) {
    proven('класс отказа не назван вовсе (' + missing.length + ' из ' + CLASSES.length + ')',
      missing,
      'три класса это ЗАКРЫТЫЙ и ОБЯЗАТЕЛЬНЫЙ набор: виджет, переживший чужой CSS и умерший на '
      + 'чужом CSP, у клиента не работает. Пропуск здесь — доказанная потеря, а не неизвестность.');
  }

  const unchecked = rows.filter((r) => CLASS_STATUS[r.status] === 'unchecked');
  if (unchecked.length) {
    proven('проверка объявлена ВЫПОЛНЕННОЙ, но класс остался НЕ ПРОВЕРЕН',
      unchecked.map((r) => r.name),
      'либо проверьте класс, либо объявите всю проверку НЕ ВЫПОЛНЕННОЙ с причиной — '
      + 'частичный прогон под вывеской выполненного и есть ложная квитанция.');
  }

  const noAddress = [];
  const ownOrigin = [];
  for (const row of rows) {
    const origin = originOf(row.evidence);
    if (!origin) { noAddress.push(row.name); continue; }
    if (origin.isFile || origin.origin === widget.origin) ownOrigin.push(row.name);
  }
  if (noAddress.length) {
    proven('класс объявлен ПРОВЕРЕННЫМ, но доказательство не называет адрес', noAddress,
      'ровно тот же дефект, что подтверждение развёртывания обращением к localhost: проверка '
      + 'обязана пользоваться адресом, который система ВЫДАЛА. Без адреса «проверено у клиента» '
      + 'и «проверено у себя» пишутся одинаково.');
  }
  if (ownOrigin.length) {
    proven('доказательство класса указывает на СВОЙ origin (или на file://)', ownOrigin,
      'origin виджета: ' + widget.origin + ' — на нём ни один из трёх классов отказа не '
      + 'воспроизводится.');
  }

  say('✅ все ' + CLASSES.length + ' классов отказа проверены на чужом origin '
    + '(' + host.origin + ' против ' + widget.origin + ')');
  say('   Ограничение: это доказывает, что проверку ВЕЛИ на чужой странице и записали её адрес — '
    + 'а не что виджет там выглядит правильно. Похожесть и целость вёрстки доказывает сравнение.');
  process.exit(0);
}

try {
  main();
} catch (err) {
  // Even an unexpected failure must not read as "clean".
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err));
}
