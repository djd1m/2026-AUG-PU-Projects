#!/usr/bin/env node
'use strict';

/**
 * check-handoff-manifest.cjs — всё, что Фаза 0 ПРОИЗВЕЛА, получило от Фазы 1 ответ по списку?
 *
 * NOT an event hook — and here that is not a stylistic note but a requirement of the cure. The
 * deliberate shape is a CALLABLE UTILITY in the form of the two that already exist
 * (`check-growth-trace.cjs`, `check-look-trace.cjs`), never an event hook: this package's hooks are
 * NON-BLOCKING by contract, pinned by tests/unit/hooks-project-anchored.test.js, which requires exit
 * 0 — a hook could only print, it could never refuse. Invoke it:
 *
 *   node .claude/hooks/check-handoff-manifest.cjs [path-to-project]
 *
 * WHY IT EXISTS — the failure, before the technology.
 *
 * The Phase 0 → Phase 1 handoff is a CLOSED LIST OF FOUR FIELDS. `commands/replicate.md` passes
 * Product Context as exactly `target_segments`, `key_competitors`, `differentiation`,
 * `monetization`. The producer's own declared output format, `agents/product-discoverer.md`, carries
 * SIX sections, and the sixth is «Key Insights for PRD — Top 3-5 insights that should inform product
 * planning». There is no field for it. None. (Growth Channels reaches the other side only through
 * the `FR-GROWTH` seed, which is a different mechanism with its own checker.)
 *
 * THE MECHANISM OF THE LOSS: the artifact IS written and it IS on disk, in
 * `docs/product-discovery-brief.md`. What the next phase lacks is an INPUT through which it could
 * reach a decision. So «used» and «silently dropped» look identical from every side — because
 * nobody is obliged to answer by list.
 *
 * MEASURED on a fixture tree (2026-09-01): a project whose brief line «Core Loop: еженедельный
 * дайджест» appears nowhere in `docs/Specification.md`, with BOTH existing seeds fully traced, gives
 * `check-growth-trace` 0, `check-look-trace` 0 and `check-docs-complete` 0 — three green guards over
 * a proven loss. They are not broken; they are answering their own questions correctly. Nothing was
 * asking this one.
 *
 * THE CLAIM THIS FILE DELIBERATELY DOES NOT MAKE. «No Phase 0 artifact gets through» is FALSE, and
 * repeating it would be the easy version of the story. Exactly two obligation families have a layer-1
 * guard and they work: `FR-GROWTH` and `FR-LOOK`. What is missing is a guard for everything ELSE the
 * run produced — which is why the manifest enumerates the run's OWN outputs rather than a fixed list
 * somebody wrote in advance.
 *
 * WHAT AN ENTRY MAY BE. Only ENUMERABLE outputs of the REAL run, each with a STABLE IDENTIFIER —
 * never free prose. Two reasons, both load-bearing: prose cannot be answered by list (which is the
 * defect), and a module that did not run must not owe anything (which is what keeps the manifest
 * honest instead of ceremonial). A module that did not run contributes no rows.
 *
 * WHAT THIS FILE CAN AND CANNOT DECIDE — read before trusting exit 0.
 *
 * It settles that every enumerated output got an ANSWER: it is named by identifier somewhere in the
 * Phase-1 documents, or it is REJECTED with a reason. Silence is neither. It does NOT settle whether
 * the answer is a good one — an insight can be cited and misused, and no deterministic check can see
 * that. That stays layer 3.
 *
 * THE EXACT FORM — appended to `docs/product-discovery-brief.md` by Phase 0 as its last section:
 *
 *   ## Манифест передачи
 *
 *   **Фаза 0 выполнена:** да             (да | нет — `--from-docs` legitimately skips Phase 0)
 *   **Проверка манифеста:** ВЫПОЛНЕНА    (ВЫПОЛНЕНА | НЕ ВЫПОЛНЕНА)
 *   **Причина:** —                       (required when НЕ ВЫПОЛНЕНА; one of the closed REASONS)
 *
 *   | Выход | Идентификатор | Модуль |
 *   |---|---|---|
 *   | Ключевые инсайты для PRD | PD-INSIGHT-001 | M5 |
 *   | Ядро продукта: еженедельный дайджест | PD-CORE-001 | M2 |
 *
 * Exit codes — three, and the third is the point:
 *   0  every enumerated output is answered — cited by identifier in a Phase-1 document, or rejected
 *      with a reason
 *   1  a defect is PROVEN and NAMED: an output nobody answered for, a rejection with no reason, or
 *      an empty manifest under «Фаза 0 выполнена: да»
 *   2  THE CHECK DID NOT RUN — no brief (Phase 0 never ran; `--from-docs` skips it), no manifest
 *      section, no Phase-1 documents to answer with, a malformed or duplicated identifier, or the
 *      legitimate answers «Фаза 0 не выполнялась» and «проверка НЕ ВЫПОЛНЕНА, причина такая-то»
 *
 * A checker that answers "clean" when it could not look converts an unknown into a reassurance.
 * "Phase 0 did not run" is not "nothing was lost".
 */

const fs = require('node:fs');
const path = require('node:path');

const BRIEF = path.join('docs', 'product-discovery-brief.md');

/**
 * The Phase-1 documents an answer may live in. The SAME list the status line calls the SPARC set, so
 * the two cannot disagree about what Phase 1 produced. An answer counts wherever it is written: the
 * obligation is to ANSWER, not to answer in a particular file.
 */
const PHASE1 = ['PRD.md', 'Solution_Strategy.md', 'Specification.md', 'Pseudocode.md',
  'Architecture.md', 'Refinement.md', 'Completion.md', 'Research_Findings.md',
  'Final_Summary.md', 'C4_Diagrams.md', 'ADR.md'];

/** Did Phase 0 run at all? A CLOSED set — `--from-docs` skips it, and that is legitimate. */
const RAN = { 'ДА': true, 'НЕТ': false };

/** Was the handoff review performed? CLOSED, and the negative answer is honest, not a failure. */
const RUN_STATUS = { 'ВЫПОЛНЕНА': 'done', 'НЕ ВЫПОЛНЕНА': 'not-done' };

/**
 * Why the handoff was not settled. CLOSED list — each entry names a DIFFERENT repair:
 *   выходы-не-перечислены — Phase 0 produced things but never enumerated them; enumerate them
 *   фаза-1-не-завершена   — there is nothing to answer WITH yet; finish Phase 1, then re-check
 *   решение-отложено      — take the decision (this is the one that becomes a silent drop)
 *   вне-объёма            — decide it is out of scope and record the decision
 */
const REASONS = ['выходы-не-перечислены', 'фаза-1-не-завершена', 'решение-отложено', 'вне-объёма'];

/** A stable identifier: `PD-<WORD>-<nnn>`. Case-sensitive and exact — a title is not an identifier,
 *  and a paraphrase cannot be answered by list, which is the whole defect. */
const ID = /\bPD-[A-Z][A-Z0-9]{1,11}-\d{3}\b/g;
const ID_EXACT = /^PD-[A-Z][A-Z0-9]{1,11}-\d{3}$/;

/** A line that REFUSES an output. Same vocabulary as `check-growth-trace.cjs`, deliberately, so the
 *  two checkers cannot disagree about what a refusal looks like. */
const REJECT_WORD = /(отклон\w*|не берём|не беремся|не берем|rejected|declined|out of scope|вне области)/i;

function say(s) { process.stdout.write(s + '\n'); }

/** Exit 2 with a reason. Never merged with "clean": not-run and not-violated are different facts. */
function cannotCheck(reason, hint) {
  say('⚠️  проверка НЕ выполнена: ' + reason);
  if (hint) say('    ' + hint);
  process.exit(2);
}

/** The value of a `**Label:** value` header line, or null when the label is absent entirely. */
function header(text, label) {
  const re = new RegExp('^\\s*\\*\\*' + label + ':?\\*\\*\\s*:?(.*)$', 'im');
  const m = re.exec(text);
  if (!m) return null;
  return m[1].trim().replace(/^[«"`]|[»"`]$/g, '').trim();
}

/** A header value read against a CLOSED map, with both failure modes kept apart. */
function closedHeader(text, label, map, what) {
  const raw = header(text, label);
  if (raw === null) {
    cannotCheck('в манифесте нет строки `**' + label + ':**`',
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
 * The body of the `## Манифест передачи` section.
 *
 * Read PER SECTION, never from the whole brief: the brief carries other tables (the competitor
 * matrix, the FR-GROWTH seed), and a global scan would read their rows as manifest entries — an
 * answer to a neighbouring question, delivered as a defect.
 */
function manifestSection(brief) {
  const lines = brief.split('\n');
  const start = lines.findIndex((l) => /^#{2,6}\s+Манифест передачи\s*$/i.test(l.trim()));
  if (start < 0) return null;
  const level = /^(#+)/.exec(lines[start].trim())[1].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s+\S/.exec(lines[i].trim());
    if (m && m[1].length <= level) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n');
}

/**
 * The enumerated outputs.
 *
 * A row is a markdown table row whose SECOND cell is an identifier. A cell holding a bracketed
 * placeholder is a TEMPLATE row, not a real output — counting it would let an untouched template
 * look like a filled-in manifest, which is the same substitution the seed checkers already refuse.
 */
function manifestRows(body) {
  const rows = [];
  const bad = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const what = cells[1];
    const id = (cells[2] || '').replace(/^[`«"]|[`»"]$/g, '').trim();
    if (!what || /^:?-+:?$/.test(what) || what.toLowerCase() === 'выход') continue;
    if (/^\[.*\]$/.test(what) || what === '...') continue;          // template row
    if (!id || /^\[.*\]$/.test(id)) { bad.push(what + ' → (нет идентификатора)'); continue; }
    if (!ID_EXACT.test(id)) { bad.push(what + ' → ' + id); continue; }
    rows.push({ what, id, module: cells[3] || '' });
  }
  return { rows, bad };
}

/** Identifiers cited by the Phase-1 documents. A REFUSAL IS NOT A CITATION — it is decided by
 *  `rejected()`, which demands a reason; otherwise `PD-INSIGHT-001 отклонён` would read as used. */
function cited(docs) {
  const seen = new Set();
  for (const text of docs.values()) {
    for (const line of text.split('\n')) {
      if (REJECT_WORD.test(line)) continue;
      ID.lastIndex = 0;
      for (let m = ID.exec(line); m !== null; m = ID.exec(line)) seen.add(m[0]);
    }
  }
  return seen;
}

/**
 * An output may be REFUSED instead of used — but only ON THE RECORD, with a reason.
 *
 * The reason must live AFTER the rejection word, and it must be WORDS. Both constraints are
 * inherited from `check-growth-trace.cjs`, where scanning the whole line was a measured false-clean:
 * the identifier itself contains hyphens, so a reason pattern that accepted punctuation matched the
 * id and passed `FR-GROWTH-001 rejected` with nothing after it.
 */
function rejected(haystacks, id) {
  const re = new RegExp('^.*\\b' + id + '\\b.*$', 'gm');
  for (const hay of haystacks) {
    for (const line of hay.match(re) || []) {
      const m = REJECT_WORD.exec(line);
      if (!m) continue;
      const tail = line.slice(m.index + m[0].length);
      if (/[\p{L}\p{N}][\p{L}\p{N}\s]{6,}/u.test(tail.replace(/^[\s:—–-]+/, ''))) return true;
    }
  }
  return false;
}

/** A rejection line that names the id but gives no reason. Reported apart from «no answer at all»
 *  because the repairs differ: one needs a decision, the other needs the decision WRITTEN DOWN. */
function refusedWithoutReason(haystacks, id) {
  const re = new RegExp('^.*\\b' + id + '\\b.*$', 'gm');
  for (const hay of haystacks) {
    for (const line of hay.match(re) || []) {
      if (REJECT_WORD.test(line)) return true;
    }
  }
  return false;
}

function main() {
  const root = process.argv[2] || '.';
  try { if (!fs.statSync(root).isDirectory()) cannotCheck('это не каталог: ' + root); }
  catch { cannotCheck('путь не существует: ' + root); }

  const briefAbs = path.join(root, BRIEF);
  let brief;
  try {
    if (!fs.statSync(briefAbs).isFile()) cannotCheck(BRIEF + ' существует, но это не файл');
    brief = fs.readFileSync(briefAbs, 'utf-8');
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      cannotCheck('нет файла ' + BRIEF,
        'это значит, что Фаза 0 не запускалась (вход `--from-docs` её пропускает) — а НЕ что '
        + 'ничего не потеряно');
    }
    cannotCheck('не читается ' + BRIEF + ': ' + ((e && e.message) || e));
  }

  const body = manifestSection(brief);
  if (body === null) {
    cannotCheck('в брифе нет раздела `## Манифест передачи`',
      'без перечня произведённого «использовано» и «молча выпало» неотличимы: отвечать не по чему. '
      + 'Отсутствие раздела — это НЕ «Фаза 0 ничего не произвела».');
  }

  const ran = closedHeader(body, 'Фаза 0 выполнена', RAN,
    'без этой строки «Фаза 0 пропущена» неотличимо от «Фаза 0 ничего не дала»');
  if (!ran) {
    cannotCheck('манифест говорит «Фаза 0 выполнена: нет» — передавать нечего',
      'это законный ответ, а не нарушение: вход `--from-docs` пропускает Фазу 0 целиком');
  }

  const run = closedHeader(body, 'Проверка манифеста', RUN_STATUS,
    'без этой строки «не сверяли» неотличимо от «сверили»');
  if (run === 'not-done') {
    const raw = header(body, 'Причина');
    if (raw === null || raw === '') {
      cannotCheck('проверка манифеста НЕ ВЫПОЛНЕНА без строки `**Причина:**`',
        'причина обязательна и берётся из закрытого списка: ' + REASONS.join(' | ')
        + ' — каждая означает СВОЙ ремонт');
    }
    const picked = REASONS.filter((r) => raw.includes(r));
    if (picked.length !== 1) {
      cannotCheck('причина «' + raw + '» не из закрытого списка (или названо сразу несколько)',
        'допустимы ровно: ' + REASONS.join(' | '));
    }
    cannotCheck('проверка манифеста НЕ ВЫПОЛНЕНА, причина: ' + picked[0],
      'честное «неизвестно», а не «всё доехало»; пока причина не закрыта, выход Фазы 0 лежит на '
      + 'диске, а входа, через который он попал бы в решения, у Фазы 1 нет');
  }

  const { rows, bad } = manifestRows(body);
  if (bad.length) {
    cannotCheck('в манифесте есть выходы без устойчивого идентификатора: ' + bad.join(', '),
      'идентификатор имеет вид `PD-СЛОВО-nnn`. Произвольная проза не может быть отвечена ПО СПИСКУ '
      + '— а отвечать по списку и есть лечение');
  }
  if (rows.length === 0) {
    say('❌ Фаза 0 объявлена выполненной, но ни один её выход не перечислен');
    say('   • раздел `## Манифест передачи` не содержит ни одной заполненной строки');
    say('   Перечень произведённого — единственное, по чему Фаза 1 может ОТВЕТИТЬ. Без него '
      + '«использовано» и «молча выпало» пишутся одинаково.');
    process.exit(1);
  }
  const ids = rows.map((r) => r.id);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length) {
    cannotCheck('в манифесте повторяются идентификаторы: ' + dupes.join(', '),
      'номер не переиспользуется — пока дубли не разведены, ОДНО упоминание в документах Фазы 1 '
      + 'зачло бы сразу два разных выхода');
  }

  // The documents an answer may live in. NONE of them present is «could not check», never «clean»:
  // there is nothing to answer WITH.
  const docs = new Map();
  for (const name of PHASE1) {
    const p = path.join(root, 'docs', name);
    try { if (fs.statSync(p).isFile()) docs.set(name, fs.readFileSync(p, 'utf-8')); } catch { /* absent */ }
  }
  if (docs.size === 0) {
    cannotCheck('в docs/ нет ни одного документа Фазы 1',
      'отвечать по манифесту не в чем — это не «всё доехало»; ожидались любые из: '
      + PHASE1.join(', '));
  }

  const haystacks = [brief, ...docs.values()];
  const seen = cited(docs);
  const silent = [];
  const unreasoned = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    if (rejected(haystacks, row.id)) continue;
    if (refusedWithoutReason(haystacks, row.id)) unreasoned.push(row);
    else silent.push(row);
  }

  if (unreasoned.length) {
    say('❌ выход отклонён БЕЗ ПРИЧИНЫ (' + unreasoned.length + ' из ' + rows.length + '):');
    for (const r of unreasoned) say('   • ' + r.id + ' — ' + r.what);
    say('   «Отклонено» без причины неотличимо от «забыли»: и то и другое оставляет читателя без '
      + 'основания решения. Назовите причину в той же строке.');
    process.exit(1);
  }
  if (silent.length) {
    say('❌ выход Фазы 0 не получил ответа от Фазы 1 (' + silent.length + ' из ' + rows.length + '):');
    for (const r of silent) say('   • ' + r.id + ' — ' + r.what + (r.module ? ' [' + r.module + ']' : ''));
    say('   Артефакт написан и лежит в ' + BRIEF + ', а входа, через который он попал бы в решения, '
      + 'нет — поэтому «использовано» и «молча выпало» выглядят одинаково. Каждый выход обязан '
      + 'быть либо назван в документе Фазы 1, либо отклонён С ПРИЧИНОЙ; молчание запрещено.');
    process.exit(1);
  }

  say('✅ все ' + rows.length + ' выход(ов) Фазы 0 получили ответ по списку в ' + docs.size
    + ' документ(ах) Фазы 1 — использованы либо отклонены с причиной');
  say('   Ограничение: это доказывает, что выход ОТВЕЧЕН, а не что ответ хорош. Инсайт можно '
    + 'процитировать и применить неверно — этого не видит ни одна детерминированная проверка (слой 3).');
  process.exit(0);
}

try {
  main();
} catch (err) {
  // Even an unexpected failure must not read as "clean".
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err));
}
