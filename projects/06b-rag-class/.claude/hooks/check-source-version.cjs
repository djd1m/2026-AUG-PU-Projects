#!/usr/bin/env node
'use strict';

/**
 * check-source-version.cjs — правка и вывод объявляют ВЕРСИЮ источника, на которой построены?
 *
 * NOT an event hook. Like its ten siblings in this directory it is a plain Node utility; nothing
 * registers it in settings.json, because this package's hooks are NON-BLOCKING by contract (pinned
 * by tests/unit/hooks-project-anchored.test.js, which requires exit 0) — a hook could only print, it
 * could never refuse. Invoke it:
 *
 *   node .claude/hooks/check-source-version.cjs [path-to-project]
 *
 * WHAT IS ALREADY PRESCRIBED, AND IS NOT RE-OPENED HERE. The half «take the status from the FILE,
 * not from the worker's narrative» is already required: the coordinator checks each receipt for
 * existence, non-emptiness and mtime freshness before merging, and the decisive field diagnosis
 * there was an `ls -la` comparing mtimes taken BEFORE the run. That half stands. This file adds the
 * one it does not reach.
 *
 * THE UNCOVERED HALF: FRESHNESS IS CHECKED ON THE RECEIPT, NEVER ON THE SOURCE THE RECEIPT WAS
 * DERIVED FROM.
 *
 * A read copy is a snapshot of the MOMENT OF READING, not of the file. So an edit addressed by a
 * literal string is a race BY CONSTRUCTION: read at T1, the file changes at T2, write at T3 against
 * a string that no longer exists — or, worse, that now means something else. The field case is
 * exact: an edit to `Refinement.md` died on an assertion because a worker had renumbered the guards
 * between the read and the write. And the symmetric case is quieter and worse: three reports saying
 * «the defect is still there» were written from stale copies, and each report was itself perfectly
 * FRESH. A freshness check on the receipt cannot see that — it answers a neighbouring question and
 * hands the answer over as if it were the asked one.
 *
 * WHY A HASH AND NOT AN INSTRUCTION. The obvious cure — a rule saying «re-read immediately before
 * editing» — is UNVERIFIABLE, and that is not a quibble: inspecting the finished file cannot show
 * whether a re-read happened, so the rule's failure is silent, which puts it on the weakest layer of
 * this package's own ladder. A DECLARED VERSION is checkable by anyone at any later time. The
 * promise is not; that is the whole argument for this shape.
 *
 * WHY A MISMATCH IS A REFUSAL WITHOUT MUTATION. When the declared version and the live file
 * disagree, the correct action is to STOP — not to apply the edit against the newer text and hope.
 * This checker embodies that literally: it never writes anything, anywhere. It reads, it decides,
 * it exits. «Отказ без мутации» is a property of the tool, not an instruction to its user.
 *
 * WHAT THIS FILE CAN AND CANNOT DECIDE — read before trusting exit 0.
 *
 * It settles that every declared edit and every declared verdict names a source that EXISTS and
 * whose live sha256 EQUALS the recorded one — that is, that nothing the run's conclusions rest on
 * has moved since those conclusions were drawn. It does NOT decide whether the conclusion follows
 * from the source, nor whether the worker really re-read anything: a matching hash proves the ground
 * did not move, never that the reasoning standing on it is right. That stays layer 3.
 *
 * THE EXACT FORM OF `docs/source-versions.md` — kept here on purpose: this file is not part of the
 * always-loaded corpus, so the long form costs nothing per run.
 *
 *   **Правки и выводы:** да              (да | нет — `нет` is a legitimate answer)
 *   **Проверка версий:** ВЫПОЛНЕНА       (ВЫПОЛНЕНА | НЕ ВЫПОЛНЕНА)
 *   **Причина:** —                       (required when НЕ ВЫПОЛНЕНА; one of the closed REASONS)
 *
 *   ## Выводы и правки
 *
 *   | Что | Вид | Источник | Хеш источника |
 *   |---|---|---|---|
 *   | перенумеровать стражей | правка | docs/Refinement.md | <64 hex> |
 *   | дефект F1 всё ещё жив   | вывод  | docs/Refinement.md | <64 hex> |
 *
 * Exit codes — three, and the third is the point:
 *   0  every edit and every verdict names a source that exists and still hashes to the declared
 *      value
 *   1  a defect is PROVEN and named: a declared version that no longer matches the live file (the
 *      race, caught before the write), a source that does not exist, a row with no source or no
 *      hash, or an empty table under «Правки и выводы: да»
 *   2  THE CHECK DID NOT RUN — no declaration file, an unrecognised value, a malformed hash,
 *      duplicate rows, or the legitimate answers «правок и выводов нет» and «проверка НЕ
 *      ВЫПОЛНЕНА, причина такая-то»
 *
 * A checker that answers "clean" when it could not look converts an unknown into a reassurance.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DECL = path.join('docs', 'source-versions.md');

/** Are there edits or verdicts to answer for? A CLOSED set — `нет` is legitimate and exits 2. */
const HAS_WORK = { 'ДА': true, 'НЕТ': false };

/** Was the version review performed? CLOSED, and the negative answer is honest, not a failure —
 *  `honest-configuration` CFG-I4: an unreachable truth yields UNKNOWN, never a plausible value. */
const RUN_STATUS = { 'ВЫПОЛНЕНА': 'done', 'НЕ ВЫПОЛНЕНА': 'not-done' };

/**
 * Why versions were not settled. CLOSED list — each entry names a DIFFERENT repair:
 *   источник-не-назван   — the edits exist but nobody recorded what they were built on
 *   источник-недоступен  — the source is outside this tree; get it, then pin it
 *   решение-отложено     — take the decision (this is the one that becomes a lost update)
 *   вне-объёма           — decide it is out of scope and record the decision
 */
const REASONS = ['источник-не-назван', 'источник-недоступен', 'решение-отложено', 'вне-объёма'];

/**
 * What a row is. CLOSED, and the two halves are kept apart on purpose: an EDIT mutates a file and a
 * VERDICT only asserts, but both are built on a snapshot and both are wrong in the same way when
 * the snapshot has aged. The field case produced one of each — a failed edit, and three reports
 * that were themselves perfectly fresh while their source was not.
 */
const KIND = { 'правка': 'edit', 'вывод': 'verdict' };

const HEX64 = /^[0-9a-f]{64}$/i;

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
    cannotCheck('в объявлении нет строки `**' + label + ':**`',
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
 * The declaration table.
 *
 * A row is a markdown table row with at least four cells whose SECOND cell is one of the two kinds —
 * so the header row and the `|---|` separator cannot be mistaken for data, and a row whose kind is
 * misspelled is REPORTED rather than silently dropped. Dropping it silently would be the same class
 * of defect the whole file is about: an unread declaration is indistinguishable from an absent one.
 */
function declRows(text) {
  const rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 6) continue;                    // '' + 4 columns + ''
    const what = cells[1];
    if (!what || /^:?-+:?$/.test(what) || what.toLowerCase() === 'что') continue;
    rows.push({
      what,
      kind: cells[2].toLowerCase(),
      source: cells[3].replace(/^[`«"]|[`»"]$/g, '').trim(),
      hash: cells[4].replace(/^[`«"]|[`»"]$/g, '').trim(),
    });
  }
  return rows;
}

function main() {
  const root = process.argv[2] || '.';
  try { if (!fs.statSync(root).isDirectory()) cannotCheck('это не каталог: ' + root); }
  catch { cannotCheck('путь не существует: ' + root); }

  const abs = path.join(root, DECL);
  let text;
  try {
    if (!fs.statSync(abs).isFile()) cannotCheck(DECL + ' существует, но это не файл');
    text = fs.readFileSync(abs, 'utf-8');
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      cannotCheck('нет файла ' + DECL,
        'это значит, что вопрос о версии источника НЕ ЗАДАВАЛСЯ — а НЕ что правки построены на '
        + 'свежем чтении; прогон без правок и выводов отвечает `**Правки и выводы:** нет`, и это '
        + 'законный ответ');
    }
    cannotCheck('не читается ' + DECL + ': ' + ((e && e.message) || e));
  }

  // 1. Is there anything built on a source at all? Nothing to pin → 2, never 0.
  const hasWork = closedHeader(text, 'Правки и выводы', HAS_WORK,
    'без этой строки «правок не было» неотличимо от «про источники не подумали»');
  if (!hasWork) {
    cannotCheck('объявление говорит «Правки и выводы: нет» — ни одна правка и ни один вывод не '
      + 'построены на прочитанном файле',
      'это законный ответ, а не нарушение: закреплять версию не на чем');
  }

  // 2. A named refusal is honest and exits 2.
  const run = closedHeader(text, 'Проверка версий', RUN_STATUS,
    'без этой строки «версии не сверяли» неотличимо от «сверили»');
  if (run === 'not-done') {
    const raw = header(text, 'Причина');
    if (raw === null || raw === '') {
      cannotCheck('проверка версий НЕ ВЫПОЛНЕНА без строки `**Причина:**`',
        'причина обязательна и берётся из закрытого списка: ' + REASONS.join(' | ')
        + ' — каждая означает СВОЙ ремонт');
    }
    const picked = REASONS.filter((r) => raw.includes(r));
    if (picked.length !== 1) {
      cannotCheck('причина «' + raw + '» не из закрытого списка (или названо сразу несколько)',
        'допустимы ровно: ' + REASONS.join(' | '));
    }
    cannotCheck('проверка версий НЕ ВЫПОЛНЕНА, причина: ' + picked[0],
      'честное «неизвестно», а не «правки построены на актуальном чтении»; пока причина не '
      + 'закрыта, свежая квитанция может добросовестно излагать выводы из устаревшего источника');
  }

  // 3. The rows.
  const rows = declRows(text);
  if (rows.length === 0) {
    proven('объявлены правки и выводы, но ни один не назван',
      ['таблица `## Выводы и правки` пуста'],
      'нельзя сверить версию источника у правки, которой нет в списке. Пустая таблица под «да» — '
      + 'доказанный пропуск, а не неизвестность.');
  }
  const keys = rows.map((r) => (r.what + '|' + r.source).toLowerCase());
  const dupes = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  if (dupes.length) {
    cannotCheck('в таблице повторяются строки: ' + dupes.join(', '),
      'одна правка над одним источником — одна строка; иначе одна сверка закрывает две разные');
  }
  const badKind = rows.filter((r) => !Object.prototype.hasOwnProperty.call(KIND, r.kind));
  if (badKind.length) {
    cannotCheck('нераспознанный `Вид`: '
      + badKind.map((r) => r.what + ' → ' + (r.kind || '(пусто)')).join(', '),
      'допустимы ровно: ' + Object.keys(KIND).join(' | ')
      + ' — правка меняет файл, вывод утверждает о нём, и устаревают они одинаково');
  }

  const noSource = rows.filter((r) => !r.source || r.source === '—');
  if (noSource.length) {
    proven('источник не назван', noSource.map((r) => r.what),
      'правка или вывод, не назвавшие файл, на котором построены, не могут быть сверены НИКОГДА: '
      + 'проверять нечего, а выглядит это как проверенное.');
  }
  const noHash = rows.filter((r) => !r.hash || r.hash === '—');
  if (noHash.length) {
    proven('версия источника не записана', noHash.map((r) => r.what + ' ← ' + r.source),
      'без записанной версии «источник не менялся» и «источник переписали после чтения» '
      + 'выглядят одинаково: путь остаётся тем же в обоих случаях. Обещание перечитать проверить '
      + 'нельзя, записанный хеш — можно.');
  }
  const malformed = rows.filter((r) => !HEX64.test(r.hash));
  if (malformed.length) {
    cannotCheck('`Хеш источника` не похож на sha256: '
      + malformed.map((r) => r.what + ' → ' + r.hash).join(', '),
      'нужны ровно 64 шестнадцатеричных знака — `sha256sum <источник>`');
  }

  // 4. THE LOAD-BEARING CHECK. Compare each declared version against the live file. Nothing is
  //    written here, by construction: a mismatch is a refusal, and a refusal does not mutate.
  const missing = [];
  const moved = [];
  for (const row of rows) {
    const src = path.join(root, row.source);
    let bytes;
    try {
      if (!fs.statSync(src).isFile()) { missing.push(row.what + ' ← ' + row.source); continue; }
      bytes = fs.readFileSync(src);
    } catch { missing.push(row.what + ' ← ' + row.source); continue; }
    const live = crypto.createHash('sha256').update(bytes).digest('hex');
    if (live.toLowerCase() !== row.hash.toLowerCase()) {
      moved.push(row.what + ' (' + KIND[row.kind] + ') ← ' + row.source
        + ': объявлено ' + row.hash.toLowerCase().slice(0, 12) + '…, на диске ' + live.slice(0, 12) + '…');
    }
  }
  if (missing.length) {
    proven('источник назван, но его нет на диске', missing,
      'ссылка указывает в пустоту, а правка при этом объявлена построенной на нём.');
  }
  if (moved.length) {
    proven('источник изменился после чтения — правка ОТКЛОНЕНА, мутации нет', moved,
      'прочитанная копия — снимок МОМЕНТА ЧТЕНИЯ, а не состояния файла: между чтением и записью '
      + 'источник переписали, и правка по литеральной строке попала бы либо мимо, либо в текст, '
      + 'который теперь значит другое. Симметрично и тише: свежий отчёт может добросовестно '
      + 'излагать вывод из устаревшего источника — квитанция при этом свежа, и её проверка '
      + 'отвечает не на тот вопрос. Перечитайте источник, перезапишите хеш и постройте правку '
      + 'заново — не применяйте её к новому тексту.');
  }

  const edits = rows.filter((r) => KIND[r.kind] === 'edit').length;
  say('✅ ' + rows.length + ' объявлени(й) сверено с диском: ' + edits + ' правк(и), '
    + (rows.length - edits) + ' вывод(ов) — каждый источник на месте и не изменился с момента чтения');
  say('   Ограничение: совпавший хеш доказывает, что почва НЕ СДВИНУЛАСЬ, — но не то, что вывод из '
    + 'неё следует и не то, что кто-то действительно перечитал файл. Это остаётся слоем 3.');
  process.exit(0);
}

try {
  main();
} catch (err) {
  // Even an unexpected failure must not read as "clean".
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err));
}
