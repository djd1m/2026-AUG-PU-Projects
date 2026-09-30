#!/usr/bin/env node
'use strict';

/**
 * check-look-trace.cjs — облик исходного продукта сняли и донесли до спецификации, или сняли и
 * выбросили?
 *
 * NOT an event hook. Like `check-ports.cjs`, `check-growth-trace.cjs` and `check-docs-complete.cjs`,
 * it lives here because this directory already carries plain Node utilities; nothing registers it in
 * settings.json. This is deliberate and load-bearing: this package's hooks are NON-BLOCKING by
 * contract (pinned by tests/unit/hooks-project-anchored.test.js, which requires exit 0), so a hook
 * could never refuse anything — it could only print. Invoke it:
 *
 *   node .claude/hooks/check-look-trace.cjs [path-to-project]
 *
 * Exit codes — three, and the third is the point:
 *   0  every seed row is traced into docs/Specification.md, or rejected on the record
 *   1  the seed table carries rows and the Specification traces none / some of them
 *   2  THE CHECK DID NOT RUN — no profile, no Specification, a table that would not parse, or a
 *      profile that legitimately says the look was NEVER CAPTURED
 *
 * A checker that answers "clean" when it could not look converts an unknown into a reassurance.
 * Three outcomes of Phase 0.5, and only ONE of them is a table to check:
 *
 *   ИСТОЧНИКА НЕТ   the project replicates nothing — a legitimate answer, and nothing to trace → 2
 *   НЕ ИЗМЕРЕНО     a source was NAMED but its look could not be captured; the reason comes from a
 *                   closed list (no-browser-mcp|unreachable|auth-required|out-of-scope) → 2
 *   СНЯТ            the look was captured → the seed table is checked → 0 / 1
 *
 * The middle state is the one this file exists for. Rule `honest-configuration` CFG-I4: when the
 * source of truth is unreachable the answer is UNKNOWN, never a plausible value — a pipeline that
 * invented a palette for a product it never looked at would be exactly that plausible value.
 *
 * TWO AXES, ONE IDENTIFIER FAMILY. `облик` (what is seen) and `путь` (the order of screens) are a
 * COLUMN of `FR-LOOK-nnn`, never a second namespace. They FAIL APART, though: a landing page can be
 * captured while the click-through dies on a 403, so each axis answers for itself —
 * `**Статус съёмки:**` for `облик`, `**Статус съёмки (путь):**` for `путь`. That is one extra
 * header line, not a second artifact.
 *
 * The `путь` declaration is demanded ONLY when the axis carries no rows: rows ARE the answer, and
 * the empty case is the one where silence and "there are no path obligations" look identical. Since
 * `capture-source-path.cjs` exists, that silence is a gap and not a default.
 *
 * An unanswered `путь` axis can turn a 0 into a 2, never a 1 into anything: a PROVEN loss outranks
 * an unanswered question. A declared «ИСТОЧНИКА НЕТ» on the path axis does NOT block a clean bill —
 * unlike the whole-profile version of that answer, the trace set here is non-empty, so 0 still
 * means something. That asymmetry is deliberate: an honest answer must stay reachable, or the
 * check degenerates into a permanent 2 nobody reads.
 */

const fs = require('node:fs');
const path = require('node:path');

const PROFILE = path.join('docs', 'source-product-profile.md');
const SPEC = path.join('docs', 'Specification.md');

/** The exact token, case-sensitive. ONE family of identifiers; the axis is a COLUMN, never a second
 *  namespace, so there is no `FR-FLOW-nnn` to keep in step with this one. */
const ID = /\bFR-LOOK-(\d{3})\b/g;

/** The capture status, as a CLOSED set owned by this code. An unmapped spelling is refused and the
 *  recognised ones are printed — never silently read as one of them. */
const STATUS = {
  'СНЯТ': 'captured',
  'НЕ ИЗМЕРЕНО': 'not-measured',
  'ИСТОЧНИКА НЕТ': 'no-source',
};

/**
 * Why a NAMED source could not be captured. Closed list — a free-text reason is not a reason here,
 * because the point of the list is that each entry names a DIFFERENT fix.
 *
 * The last four arrived with the browser instrument for the `путь` axis
 * (`capture-source-path.cjs`), which owns the same list; they are the ways a CLICK-THROUGH fails
 * and each has its own repair: install a browser · narrow the scope or stop · nothing to do, the
 * site refuses · raise the budget. `no-browser-mcp` (the clone-website prerequisite) and
 * `no-browser` (a local Playwright) are DIFFERENT missing tools and stay separate entries.
 */
const REASONS = ['no-browser-mcp', 'unreachable', 'auth-required', 'out-of-scope',
  'no-browser', 'bot-protected', 'timeout', 'robots-disallowed'];

/** The axis a row belongs to. Closed, and checked, because "one identifier family, axis as a column"
 *  is only true while the column actually carries a value from the family. */
const AXES = ['облик', 'путь'];

/** A line that refuses an obligation. Shared by mentioned() and rejected() so the two rules cannot
 *  disagree about what a refusal looks like. */
const REJECT_WORD = /(отклон\w*|не берём|не беремся|не берем|rejected|declined|out of scope|вне области)/i;

function say(s) { process.stdout.write(s + '\n'); }

/** Exit 2 with a reason. Never merged with "clean": not-run and not-violated are different facts. */
function cannotCheck(reason, hint) {
  say('⚠️  проверка НЕ выполнена: ' + reason);
  if (hint) say('    ' + hint);
  process.exit(2);
}

/**
 * Read one required file. Asks about the EXACT path — never lists a directory and matches names
 * against the listing, because a listing answers a different question than "does this file exist"
 * and the two diverge on case, symlinks and unicode normalisation.
 */
function readRequired(root, rel, absentReason, hint) {
  const abs = path.join(root, rel);
  let st;
  try { st = fs.statSync(abs); } catch { cannotCheck(absentReason, hint); }
  if (!st.isFile()) cannotCheck(rel + ' существует, но это не файл');
  try { return fs.readFileSync(abs, 'utf-8'); } catch (e) {
    cannotCheck('не читается ' + rel + ': ' + ((e && e.message) || e));
  }
  return '';
}

/** The value of a `**Label:** value` header line, or null when the label is absent entirely.
 *  An EMPTY value is returned as '' and is never collapsed into "absent" — CFG-I2. */
function header(text, label) {
  const re = new RegExp('^\\s*\\*\\*' + label + ':?\\*\\*\\s*:?(.*)$', 'im');
  const m = re.exec(text);
  return m ? m[1].trim().replace(/^[«"`]|[»"`]$/g, '').trim() : null;
}

/**
 * The three outcomes, decided BEFORE any table is parsed.
 *
 * Order matters: a project with no source legitimately has no rows, and reaching the table first
 * would report "таблица пуста" — blaming the project for an answer it gave correctly.
 */
function captureState(profile) {
  const raw = header(profile, 'Статус съёмки');
  if (raw === null) {
    cannotCheck('в профиле нет строки `**Статус съёмки:**`',
      'без неё нельзя отличить «источника нет» от «источник назван, но не снят» — '
      + 'допустимые значения: ' + Object.keys(STATUS).join(' | '));
  }
  const key = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  if (!Object.prototype.hasOwnProperty.call(STATUS, key)) {
    cannotCheck('нераспознанный статус съёмки: ' + (key === '' ? '(пусто)' : key),
      'допустимы ровно: ' + Object.keys(STATUS).join(' | '));
  }
  const state = STATUS[key];

  if (state === 'no-source') {
    cannotCheck('профиль говорит ИСТОЧНИКА НЕТ — проект ничего не воспроизводит',
      'это законный ответ Фазы 0.5, а не нарушение; прослеживать нечего, поэтому не 0 и не 1');
  }

  if (state === 'not-measured') {
    const reason = pickReason(profile, 'Причина', 'облик');
    cannotCheck('облик источника НЕ ИЗМЕРЕН, причина: ' + reason,
      'источник назван, но не снят — это честное «неизвестно», а не «требований по облику нет»; '
      + 'отраслевая палитра в этом состоянии остаётся фолбэком, и он помечается как фолбэк');
  }

  return state;   // 'captured'
}

/**
 * The reason a NAMED source went uncaptured, from the CLOSED list.
 *
 * Shared by both axes on purpose: two copies of this rule would drift, and then one axis would
 * accept a spelling the other refuses. Free text is not a reason — the whole value of the list is
 * that each entry names a different repair, so "было некогда" leaves the reader with nothing to do.
 */
function pickReason(profile, label, axisLabel) {
  const reason = header(profile, label);
  if (reason === null || reason === '') {
    cannotCheck('статус НЕ ИЗМЕРЕНО (' + axisLabel + ') без строки `**' + label.replace(/\\/g, '') + ':**`',
      'источник назван, но не снят — причина обязательна и берётся из закрытого списка: '
      + REASONS.join(' | '));
  }
  const picked = REASONS.filter((r) => new RegExp('(^|[^a-z-])' + r + '([^a-z-]|$)', 'i').test(reason));
  if (picked.length !== 1) {
    cannotCheck('причина «' + reason + '» (' + axisLabel + ') не из закрытого списка '
      + '(или названо сразу несколько)',
      'допустимы ровно: ' + REASONS.join(' | ') + ' — каждая означает СВОЙ ремонт, '
      + 'поэтому свободный текст здесь не причина');
  }
  return picked[0];
}

/**
 * The `путь` axis, answered SEPARATELY from `облик`.
 *
 * Why a second status line and not a second artifact: the axes fail apart. A landing page can be
 * captured while the click-through dies on a 403, and one shared status would have to lie about one
 * of them. The identifier family stays ONE — this adds a header line, not a namespace.
 *
 * Rows are the evidence: any `путь` row means the axis was captured and nothing more is asked. The
 * declaration is required ONLY when the axis is EMPTY, because that is the state where silence and
 * "there are no path obligations" look identical — and since the instrument exists
 * (`capture-source-path.cjs`), silence is a gap, not a default.
 */
function pathAxisState(profile, rows) {
  if (rows.some((r) => r.axis === 'путь')) return { state: 'captured' };

  const raw = header(profile, 'Статус съёмки \\(путь\\)');
  if (raw === null) {
    cannotCheck('ось «путь» пуста и не объявлена',
      'молчание об оси «путь» неотличимо от «обязательств по пути нет», а инструмент для неё есть: '
      + '`node .claude/hooks/capture-source-path.cjs <url>`. Объявите исход строкой '
      + '`**Статус съёмки (путь):**` — ' + Object.keys(STATUS).join(' | '));
  }
  const key = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  if (!Object.prototype.hasOwnProperty.call(STATUS, key)) {
    cannotCheck('нераспознанный статус съёмки (путь): ' + (key === '' ? '(пусто)' : key),
      'допустимы ровно: ' + Object.keys(STATUS).join(' | '));
  }
  const state = STATUS[key];
  if (state === 'captured') {
    cannotCheck('ось «путь» объявлена СНЯТ, но в таблице нет ни одной строки с осью «путь»',
      'снятый путь, который никто не записал обязательством, ничем не отличается от неснятого');
  }
  if (state === 'not-measured') {
    return { state, reason: pickReason(profile, 'Причина \\(путь\\)', 'путь') };
  }
  return { state };   // 'no-source' — у источника нет пути (одноэкранный продукт)
}

/**
 * The seed rows, as the profile records them.
 *
 * A row is a markdown table row whose FIRST cell is an id. The template ships an example row with a
 * placeholder id, so a row whose requirement cell is still a bracketed placeholder is a TEMPLATE
 * row, not a real obligation, and counting it would let an untouched template look like a
 * filled-in one.
 */
function seedRows(profile) {
  const rows = [];
  for (const raw of profile.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    // cells[0] is '' for a leading pipe; the id lives in cells[1]
    if (!/^FR-LOOK-\d{3}$/.test(cells[1] || '')) continue;
    const requirement = cells[2] || '';
    const isPlaceholder = /^\[.*\]$/.test(requirement) || requirement === '...' || requirement === '';
    if (isPlaceholder) continue;
    rows.push({
      id: cells[1],
      axis: (cells[3] || '').toLowerCase(),
      status: cells[6] || '',
    });
  }
  return rows;
}

/**
 * Ids the Specification mentions, by the same definition check-growth-trace uses.
 *
 * A REJECTION LINE IS NOT A MENTION. The two rules overlap on exactly the case that matters: a line
 * reading `FR-LOOK-001 отклонено` contains the exact token, so a naive mention rule reports the
 * obligation as carried forward — and the reason requirement on the rejection path is never reached.
 */
function mentioned(spec) {
  const out = new Set();
  for (const line of spec.split('\n')) {
    if (REJECT_WORD.test(line)) continue;   // a refusal is decided by rejected(), which wants a reason
    ID.lastIndex = 0;
    for (let m = ID.exec(line); m !== null; m = ID.exec(line)) out.add(m[0]);
  }
  return out;
}

/**
 * A row may also be REJECTED on the record instead of traced. A rejection is a line naming the id
 * together with a rejection word AND a reason marker, because "FR-LOOK-004 не берём" with nothing
 * after it is indistinguishable from forgetting.
 */
function rejected(profile, spec, id) {
  const re = new RegExp('^.*\\b' + id + '\\b.*$', 'gm');
  for (const hay of [profile, spec]) {
    for (const line of hay.match(re) || []) {
      const m = REJECT_WORD.exec(line);
      if (!m) continue;
      // The reason must live AFTER the rejection word, and it must be WORDS: the IDENTIFIER itself
      // carries two hyphens, so a pattern that accepts punctuation would read the id as its own
      // justification.
      const tail = line.slice(m.index + m[0].length);
      const hasReason = /[\p{L}\p{N}][\p{L}\p{N}\s]{6,}/u.test(tail.replace(/^[\s:—–-]+/, ''));
      if (hasReason) return true;
    }
  }
  return false;
}

function main() {
  const root = process.argv[2] || '.';
  try { if (!fs.statSync(root).isDirectory()) cannotCheck('это не каталог: ' + root); }
  catch { cannotCheck('путь не существует: ' + root); }

  const profile = readRequired(root, PROFILE,
    'нет файла ' + PROFILE,
    'это значит, что Фаза 0.5 не запускалась — а НЕ что облик воспроизводить не надо; '
    + 'Фаза 0.5 обязательна и на входе --from-docs, который пропускает только Фазу 0');

  captureState(profile);   // exits 2 on «источника нет» and on «НЕ ИЗМЕРЕНО»

  const rows = seedRows(profile);

  // A REUSED id makes the profile malformed, and malformed is exit 2 — never a pass. When a number
  // is reused, two distinct obligations share one token and a SINGLE mention in the Specification
  // marks BOTH traced: coverage counted over usable ITEMS instead of per POSITION.
  const dupes = [...new Set(rows.map((r) => r.id).filter((id, i, a) => a.indexOf(id) !== i))];
  if (dupes.length) {
    cannotCheck('в таблице-семени повторяются идентификаторы: ' + dupes.join(', '),
      'номер FR-LOOK-nnn не переиспользуется — пока дубли не разведены, одно упоминание в '
      + 'Specification.md зачло бы сразу два разных обязательства');
  }

  // The axis is a COLUMN of the one identifier family. A row that does not name its axis makes that
  // claim false, and the honest answer is «не проверено», not «прослежено».
  const noAxis = rows.filter((r) => !AXES.includes(r.axis));
  if (noAxis.length) {
    cannotCheck('строки без оси из закрытого списка: ' + noAxis.map((r) => r.id).join(', '),
      'колонка «Ось» обязана быть одним из: ' + AXES.join(' | ') + ' — ось это КОЛОНКА одного '
      + 'семейства идентификаторов, а не второе пространство имён');
  }

  if (!rows.length) {
    // Status says СНЯТ, yet nothing was written down. That is not a clean bill and not a loss
    // either — the table was never filled, so there is nothing to trace.
    cannotCheck('статус СНЯТ, но в профиле нет ни одной заполненной строки FR-LOOK-nnn',
      'скобочные заглушки шаблона не считаются обязательствами — снятый облик, который никто не '
      + 'записал требованием, ничем не отличается от неснятого');
  }

  const hypothesisRows = rows.filter((r) => r.status === 'ГИПОТЕЗА' || r.status === 'УСТАРЕЛО');
  const promotableRows = rows.filter((r) => r.status !== 'ГИПОТЕЗА' && r.status !== 'УСТАРЕЛО');
  if (hypothesisRows.length) {
    say('ℹ строк-гипотез вне промоушена: ' + hypothesisRows.length
      + ' — их проверяет check-look-origin.cjs');
  }
  if (!promotableRows.length) {
    cannotCheck('все строки — гипотезы, промоушен ещё не имел права случиться',
      'это проверяет check-look-origin.cjs; ноль промотируемых строк не является чистой квитанцией');
  }

  // The `путь` axis is answered BEFORE the tracing verdict but does not decide it: a proven loss
  // outranks an unanswered axis, so this only records what the axis said.
  const pathAxis = pathAxisState(profile, promotableRows);

  const spec = readRequired(root, SPEC, 'нет файла ' + SPEC,
    'без спецификации не с чем сверять — это не «всё прослежено»');

  const seen = mentioned(spec);
  const missing = promotableRows.filter((r) => !seen.has(r.id) && !rejected(profile, spec, r.id));

  if (missing.length === promotableRows.length) {
    say('❌ ни одно обязательство по облику не доехало до ' + SPEC + ':');
    for (const r of missing) say('   • ' + r.id + ' (' + r.axis + ')');
    say('   Облик источника сняли и выбросили — это ровно тот класс потерь, который ловит проверка.');
    process.exit(1);
  }
  if (missing.length) {
    say('❌ часть обязательств по облику потеряна (' + missing.length + ' из '
      + promotableRows.length + '):');
    for (const r of missing) say('   • ' + r.id + ' (' + r.axis + ')');
    say('   Каждое надо либо перенести в ' + SPEC + ', либо отклонить С ПРИЧИНОЙ — молча уронить нельзя.');
    process.exit(1);
  }
  // Every row is traced. Now, and only now, the unanswered `путь` axis decides between 0 and 2:
  // «прослежено всё, что записали» over a profile that never looked at the path would report a
  // complete check that was half a check.
  if (pathAxis.state === 'not-measured') {
    cannotCheck('строки прослежены, но ось «путь» НЕ ИЗМЕРЕНА, причина: ' + pathAxis.reason,
      'проверена только ось «облик» — это половина проверки, а не чистая квитанция; '
      + 'инструмент оси: `node .claude/hooks/capture-source-path.cjs <url>`');
  }

  say('✅ все ' + promotableRows.length + ' обязательств по облику прослежены в ' + SPEC
    + ' либо отклонены с причиной');
  if (pathAxis.state === 'no-source') {
    say('   Ось «путь»: ИСТОЧНИКА НЕТ — у источника нет пути (одноэкранный продукт), объявлено явно.');
  }
  say('   Ограничение: это доказывает, что обязательство ДОНЕСЛИ, а не что интерфейс на него похож.');
  process.exit(0);
}

try {
  main();
} catch (err) {
  // Even an unexpected failure must not read as "clean".
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err));
}
