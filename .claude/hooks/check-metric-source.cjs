#!/usr/bin/env node
'use strict';

/**
 * check-metric-source.cjs — метрика называет, ОТКУДА берётся её значение?
 *
 * NOT an event hook — this package's hooks are NON-BLOCKING by contract (pinned by
 * tests/unit/hooks-project-anchored.test.js, which requires exit 0), so a hook could only print.
 * Invoke it, in the form of its siblings:
 *
 *   node .claude/hooks/check-metric-source.cjs [path-to-project]
 *
 * WHY IT EXISTS — the failure, before the technology.
 *
 * The Success Metrics table has three columns: Metric, Target, Timeline. There is no column for
 * where the number comes from. The completion checklist asks only whether «метрики успеха измеримы»
 * — that is, whether a NUMBER is present. And the single validator lens that looks OUTSIDE the
 * documents reads exactly one thing, `Architecture.md` → `## External Dependencies`, so a metric
 * living in the PRD never reaches it: there is no route, not a weak one.
 *
 * THE MECHANISM: measurability is decided by the SHAPE OF A NUMBER, never by the system's ability to
 * OBTAIN that number. «Доля дошедших до публикации отзыва — 40% — неделя 1» passes completeness,
 * passes measurability and passes consistency, on a platform whose API exposes no reviews at all.
 * The feature is then designed around a promise nobody can keep, and nothing in the pipeline is
 * capable of noticing, because every check it passes was asking a different question.
 *
 * MEASURED on a fixture tree (2026-09-01): a project carrying that exact metric line and a
 * requirement resting on a non-existent `reviews.publish` method passes ALL SEVEN shipped guards —
 * three answer 0 and four answer 2. Not one of them is capable of naming the metric. They are not
 * broken; nothing was asking this.
 *
 * THE CURE, and the reason the fourth column is a CLOSED list. An open «Source» column would be
 * filled with «из аналитики», which is a genre of place, not a place — the same defect as a spend
 * ceiling named «разумный», or evidence that is a URL nobody opened. A closed list forces the author
 * to land on one of four DIFFERENT commitments, and each of them can be argued with:
 *
 *   наш журнал         we already write this; the number exists the moment we look
 *   наша БД            we already store this; a query produces it
 *   внешний API: X     somebody else must hand it to us, THROUGH A NAMED METHOD
 *   ручное измерение: X a person will count it, and HOW is stated
 *
 * MANUAL MEASUREMENT IS A LEGITIMATE ANSWER, and refusing it would be the wrong kind of strictness —
 * it would push people to dress a hand count as instrumentation. What is refused is manual
 * measurement PRESENTED AS instrumented: «сверка пяти карточек глазами» is a fine source and a
 * terrible dashboard.
 *
 * THE LOAD-BEARING CONSEQUENCE. A metric whose source is an EXTERNAL API must produce a row in the
 * external-dependency inventory. That is not bookkeeping: it is the only route by which a metric
 * ever comes under the one lens that looks outside the documents at all. Without it the metric's
 * feasibility is never established by anything, however many green verdicts the run collects.
 *
 * WHAT THIS FILE CAN AND CANNOT DECIDE — read before trusting exit 0.
 *
 * It settles that every metric names a source from the closed four, that an external API names a
 * METHOD rather than a vendor, and that such a metric has a matching inventory row. It does NOT call
 * the API, does not know whether the method exists, and cannot tell a real log from a planned one.
 * Whether the number can actually be obtained stays layer 3 — but it is now ASKED, and an
 * unanswerable metric can be argued about before the feature is designed around it.
 *
 * Exit codes — three, and the third is the point:
 *   0  every metric names a source from the closed list, and every external-API metric has its
 *      inventory row
 *   1  a defect is PROVEN and NAMED: a metric with no source column at all, an empty source, a
 *      source outside the closed list, an external API named without a method, a manual measurement
 *      that does not say how, or an external-API metric with no row in the inventory
 *   2  THE CHECK DID NOT RUN — no document carrying `## Success Metrics`, a section holding only
 *      the shipped template row, or duplicate metric rows
 *
 * A checker that answers "clean" when it could not look converts an unknown into a reassurance.
 */

const fs = require('node:fs');
const path = require('node:path');

/** Where a Success Metrics table may live. Both, because the skill declares it in both places. */
const DOCS = [path.join('docs', 'PRD.md'), path.join('docs', 'Final_Summary.md')];
const ARCH = path.join('docs', 'Architecture.md');

const METRICS_HEADING = /^#{2,6}\s+Success Metrics\s*$/i;
const DEPS_HEADING = /^#{2,6}\s+External Dependencies\s*$/i;

/**
 * The closed four. Each is a DIFFERENT commitment, and that is the whole reason the list is closed:
 * an open column collects «из аналитики», which names a genre of place rather than a place.
 */
const SOURCES = [
  { key: 'наш журнал', kind: 'log', needsDetail: false },
  { key: 'наша бд', kind: 'db', needsDetail: false },
  { key: 'внешний api', kind: 'external', needsDetail: true },
  { key: 'ручное измерение', kind: 'manual', needsDetail: true },
];

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
 * The body of a section, or null when the heading is absent.
 *
 * Read PER SECTION, never globally: these documents are full of three-column tables (Timeline &
 * Phases sits directly below Success Metrics and has exactly the same shape), and a global scan
 * would read a phase row as a metric with no source — a defect reported where none exists.
 * Fenced blocks are skipped so a `##` inside an example cannot invent a section.
 */
function section(text, heading) {
  const lines = text.split('\n');
  let fenced = false;
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fenced = !fenced; continue; }
    if (fenced) continue;
    if (start < 0) {
      if (heading.test(lines[i].trim())) { start = i; level = /^(#+)/.exec(lines[i].trim())[1].length; }
      continue;
    }
    const m = /^(#{1,6})\s+\S/.exec(lines[i].trim());
    if (m && m[1].length <= level) return lines.slice(start + 1, i).join('\n');
  }
  return start < 0 ? null : lines.slice(start + 1).join('\n');
}

/**
 * Metric rows.
 *
 * `cells` is kept RAW rather than destructured into four names, because the defect this file exists
 * for is a row with only THREE cells — a table that never had a provenance column at all. Reading it
 * as «the fourth cell is empty» would report the wrong repair: the fix is a column, not a value.
 */
function metricRows(body) {
  const out = [];
  let templates = 0;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    cells.shift();
    if (cells.length && cells[cells.length - 1] === '') cells.pop();
    if (cells.length < 3) continue;
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    const name = cells[0];
    if (!name || /^metric$/i.test(name) || /^метрика$/i.test(name)) continue;
    if (/^\[.*\]$/.test(name) || name === '...') { templates += 1; continue; }
    out.push({ name, target: cells[1] || '', timeline: cells[2] || '', cells });
  }
  return { out, templates };
}

/** Which of the closed four a source cell names, plus whatever detail follows the colon. */
function classify(cell) {
  const raw = String(cell || '').replace(/^[`«"]|[`»"]$/g, '').trim();
  const lower = raw.toLowerCase();
  for (const s of SOURCES) {
    if (lower === s.key || lower.startsWith(s.key + ':') || lower.startsWith(s.key + ' :')) {
      const detail = raw.slice(raw.indexOf(':') + 1).trim();
      return { ...s, raw, detail: raw.includes(':') ? detail : '' };
    }
  }
  return { kind: 'unrecognised', raw, detail: '' };
}

/** The inventory's own text, so an external-API metric can be looked for in it. */
function inventoryText(root) {
  try {
    const text = fs.readFileSync(path.join(root, ARCH), 'utf-8');
    return section(text, DEPS_HEADING);
  } catch { return null; }
}

function main() {
  const root = process.argv[2] || '.';
  try { if (!fs.statSync(root).isDirectory()) cannotCheck('это не каталог: ' + root); }
  catch { cannotCheck('путь не существует: ' + root); }

  let body = null;
  let where = null;
  for (const rel of DOCS) {
    let text;
    try { text = fs.readFileSync(path.join(root, rel), 'utf-8'); } catch { continue; }
    const found = section(text, METRICS_HEADING);
    if (found !== null) { body = body === null ? found : body + '\n' + found; where = where ? where + ', ' + rel : rel; }
  }
  if (body === null) {
    cannotCheck('ни в одном из документов нет раздела `## Success Metrics`: ' + DOCS.join(', '),
      'метрики не написаны — это НЕ «у метрик всё в порядке с источником»');
  }

  const { out: rows, templates } = metricRows(body);
  if (rows.length === 0) {
    cannotCheck(templates
      ? 'в таблице метрик только шаблонные строки (' + templates + ')'
      : 'раздел `## Success Metrics` есть, но метрик в нём нет',
      'проверять нечего; заполненная таблица — предусловие этого вопроса, а не его ответ');
  }
  const names = rows.map((r) => r.name.toLowerCase());
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  if (dupes.length) {
    cannotCheck('в таблице метрик повторяются строки: ' + dupes.join(', '),
      'одна метрика — одна строка; иначе один источник закрывает две разные');
  }

  // THE CORE DEFECT: a table that never had a fourth column. Reported as its own case, because the
  // repair is a COLUMN, not a value — and telling the author to fill a cell that does not exist is
  // the kind of message people ignore.
  const noColumn = rows.filter((r) => r.cells.length < 4);
  if (noColumn.length) {
    proven('в таблице метрик нет колонки «Источник значения»',
      noColumn.map((r) => r.name + ' → ' + (r.target || '(без цели)')),
      'измеримость сейчас проверяется формой ЧИСЛА, а не способностью системы это число добыть: '
      + 'недобываемая метрика проходит полноту, измеримость и непротиворечивость с отличием. '
      + 'Добавьте четвёртую колонку: наш журнал | наша БД | внешний API: <метод> | '
      + 'ручное измерение: <как>.');
  }

  const classified = rows.map((r) => ({ ...r, source: classify(r.cells[3]) }));

  const empty = classified.filter((r) => r.source.raw === '' || r.source.raw === '—');
  if (empty.length) {
    proven('источник значения не назван', empty.map((r) => r.name),
      'пустая клетка — блокер, а не примечание: она означает, что вопрос «а мы вообще сможем это '
      + 'посчитать?» не задавали.');
  }
  const unrecognised = classified.filter((r) => r.source.kind === 'unrecognised');
  if (unrecognised.length) {
    proven('источник значения вне закрытого списка',
      unrecognised.map((r) => r.name + ' → «' + r.source.raw + '»'),
      'допустимы ровно: наш журнал | наша БД | внешний API: <метод> | ручное измерение: <как>. '
      + '«Из аналитики» — жанр места, а не место: спросить у него ничего нельзя, ровно как у '
      + 'предела «разумный» или у ссылки, которую никто не открывал.');
  }
  const vague = classified.filter((r) => r.source.needsDetail && !r.source.detail);
  if (vague.length) {
    proven('источник назван, но не сказано ЧЕМ именно',
      vague.map((r) => r.name + ' → «' + r.source.raw + '»'),
      'у внешнего API обязан быть назван МЕТОД, а у ручного измерения — способ. Поставщик без '
      + 'метода не проверяем: у одного и того же сервиса одна способность есть, а соседней нет. '
      + 'Ручное измерение — законный ответ, но названный: «сверка пяти карточек глазами» — '
      + 'хороший источник и плохая приборная панель.');
  }

  // THE LOAD-BEARING CONSEQUENCE: an external-API metric must reach the one lens that looks outside
  // the documents, and an inventory row is the only route there is.
  const external = classified.filter((r) => r.source.kind === 'external');
  if (external.length) {
    const inventory = inventoryText(root);
    const haystack = (inventory || '').toLowerCase();
    const orphans = external.filter((r) => {
      const token = r.source.detail.toLowerCase().replace(/^[`«"]|[`»"]$/g, '').trim();
      return !token || !haystack.includes(token);
    });
    if (orphans.length) {
      proven('метрика опирается на внешний API, которого нет в инвентаре внешних зависимостей',
        orphans.map((r) => r.name + ' → ' + r.source.raw),
        inventory === null
          ? 'в ' + ARCH + ' нет раздела `## External Dependencies` вовсе. Инвентарь — ЕДИНСТВЕННЫЙ '
            + 'маршрут, по которому метрика попадает под линзу, смотрящую НАРУЖУ документов: без '
            + 'строки её осуществимость не устанавливается ничем, сколько бы зелёных вердиктов '
            + 'прогон ни собрал.'
          : 'инвентарь есть, но названного метода в нём нет. Метрика, назвавшая внешний API, '
            + 'ОБЯЗАНА породить строку инвентаря — иначе она никогда не попадёт под шестую линзу, '
            + 'и её осуществимость не проверит никто.');
    }
  }

  const byKind = (k) => classified.filter((r) => r.source.kind === k).length;
  say('✅ ' + rows.length + ' метрик(и) в ' + where + ' называют источник значения из закрытого '
    + 'списка (журнал ' + byKind('log') + ', БД ' + byKind('db') + ', внешний API ' + byKind('external')
    + ', вручную ' + byKind('manual') + ')');
  if (external.length) {
    say('   Каждая метрика на внешнем API имеет строку инвентаря — только так она попадает под '
      + 'линзу, смотрящую наружу документов.');
  }
  say('   Ограничение: проверка НЕ ЗОВЁТ API и не знает, существует ли метод; она доказывает, что '
    + 'вопрос «сможем ли мы это добыть» ЗАДАН и получил один из четырёх ответов (слой 3 — сам ответ).');
  process.exit(0);
}

try {
  main();
} catch (err) {
  // Even an unexpected failure must not read as "clean".
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err));
}
