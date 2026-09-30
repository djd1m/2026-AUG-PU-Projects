#!/usr/bin/env node
'use strict';

/**
 * check-file-ownership.cjs — у каждого записываемого файла ровно один писатель, ВКЛЮЧАЯ файлы,
 * которые родились посреди прогона?
 *
 * NOT an event hook. Like its nine siblings in this directory it is a plain Node utility; nothing
 * registers it in settings.json, because this package's hooks are NON-BLOCKING by contract (pinned
 * by tests/unit/hooks-project-anchored.test.js, which requires exit 0) — a hook could only print, it
 * could never refuse. Invoke it:
 *
 *   node .claude/hooks/check-file-ownership.cjs [path-to-project]
 *
 * WHAT IS ALREADY CLOSED, AND MUST NOT BE RE-OPENED HERE. The general «two writers, one file» half
 * of this problem is settled twice over in this package: the shared-store principle, and the
 * ownership split BY ORIGIN between `/replicate` and `/start` (architecture-derived files to one,
 * build-derived to the other — see tests/unit/pipeline-file-ownership.test.js). This file adds
 * exactly the half those two do not cover.
 *
 * THE UNCOVERED HALF: THE LIFECYCLE OF OWNERSHIP — what happens to ownership when a file APPEARS
 * during the run.
 *
 * A file born by SPLITTING a large file inherits an owner from nobody. Ownership does not travel by
 * itself: the moment `Architecture-OPS.md` is carved out of `Architecture.md`, there is a new
 * document and no single writer for it. The field case is exact and it is quiet: a coordinator wrote
 * a paragraph into the fresh `Architecture-OPS.md` about a permission that the owner of the SOURCE
 * file was revoking in the neighbouring document in the same minutes. Both authors were internally
 * consistent. Both files were individually correct. The two documents contradicted each other, and
 * nothing in the run could observe that, because the contradiction lived between them.
 *
 * The second measured signature of the same failure, this repository 2026-09-01: the two swarms
 * working in their own worktrees produced 23 and 17 merge conflicts, while the swarm working in the
 * MAIN tree produced none at all — not because it was better coordinated, but because its second
 * writer edited a live file with no merge to arbitrate. A silent overwrite leaves no conflict to
 * count. Conflicts are the LOUD form of this defect; the main tree got the quiet form.
 *
 * WHY THE COORDINATOR HAS A MANDATORY ROW. Every dispatched unit knows it is a writer. The
 * coordinator is the one writer nobody dispatched, and in the field case it is precisely the
 * coordinator that wrote. A table that enumerates the units and omits the coordinator is total over
 * everyone except the author of the defect.
 *
 * WHAT THIS FILE CAN AND CANNOT DECIDE — read before trusting exit 0.
 *
 * It reads a DECLARATION, `docs/dispatch-plan.md`, and decides only what a declaration can settle:
 * that the ownership table is TOTAL (every dispatched unit owns something, every owner is somebody
 * who exists) and UNAMBIGUOUS (no file has two owners), that the coordinator answered for itself,
 * and that every file born by a split got an owner AT CREATION and that this owner agrees with the
 * ownership table.
 *
 * It CANNOT decide behaviour, and this is not a gap to be closed later — it is a boundary. A
 * coordinator that edits somebody else's file outside the protocol leaves the plan untouched and
 * this check green. A layer-1 check of the BEHAVIOUR does not exist without write attribution, and
 * saying so out loud is the difference between a bounded guarantee and a false one. The package
 * writes this same caveat in five other rules; it is written here for the same reason.
 *
 * THE EXACT FORM OF `docs/dispatch-plan.md` — kept here on purpose: this file is not part of the
 * always-loaded corpus, so the long form costs nothing per run. It is the SAME artifact the canon
 * check reads; the two answer different questions and exit independently.
 *
 *   **Пишущий фан-аут:** да              (да | нет — `нет` is a legitimate answer)
 *   **Координатор пишет:** да            (да | нет — but it must ANSWER)
 *   **Разрезы файлов:** да               (да | нет — an absent section is not «there were none»)
 *   **Проверка владения:** ВЫПОЛНЕНА     (ВЫПОЛНЕНА | НЕ ВЫПОЛНЕНА)
 *   **Причина:** —                       (required when НЕ ВЫПОЛНЕНА; one of the closed REASONS)
 *
 *   ## Единицы
 *
 *   | Единица | Что пишет |
 *   |---|---|
 *   | packages/api | src/api/**, tests/api/** |
 *   | packages/web | src/web/**, tests/web/** |
 *
 *   ## Владение
 *
 *   | Файл | Владелец |
 *   |---|---|
 *   | docs/Architecture.md | packages/api |
 *   | docs/Architecture-OPS.md | координатор |
 *
 *   ## События разреза
 *
 *   | Новый файл | Разрезан из | Владелец |
 *   |---|---|---|
 *   | docs/Architecture-OPS.md | docs/Architecture.md | координатор |
 *
 * Exit codes — three, and the third is the point:
 *   0  ownership is total and unambiguous, the coordinator answered for itself, and every
 *      split-born file carries an owner that agrees with the table
 *   1  a defect is PROVEN and named: one file with two owners, an owner nobody dispatched, a
 *      dispatched unit that owns nothing, a coordinator that writes and is not in the table (or
 *      declares it writes nothing and appears anyway), an empty ownership table under a writing
 *      fan-out, a split that produced a file with no owner, a split whose owner contradicts the
 *      table, or a declared split with an empty split table
 *   2  THE CHECK DID NOT RUN — no plan, an unrecognised value, a duplicated row, or the legitimate
 *      answers «пишущего фан-аута нет» and «проверка НЕ ВЫПОЛНЕНА, причина такая-то»
 *
 * A checker that answers "clean" when it could not look converts an unknown into a reassurance.
 */

const fs = require('node:fs');
const path = require('node:path');

const PLAN = path.join('docs', 'dispatch-plan.md');

/** Does this dispatch WRITE? A CLOSED set — a read-only fan-out owns nothing and exits 2. */
const WRITES = { 'ДА': true, 'НЕТ': false };

/** Does the coordinator write? CLOSED, and it must ANSWER: the coordinator is the one writer nobody
 *  dispatched, and in the measured field case it is the one that wrote. */
const COORD_WRITES = { 'ДА': true, 'НЕТ': false };

/** Were any files split during the run? CLOSED. An absent section would read as «there were none»,
 *  which is the same substitution as an absent inventory reading as «no dependencies». */
const SPLITS = { 'ДА': true, 'НЕТ': false };

/** Was the ownership review performed? CLOSED, and the negative answer is honest, not a failure —
 *  `honest-configuration` CFG-I4: an unreachable truth yields UNKNOWN, never a plausible value. */
const RUN_STATUS = { 'ВЫПОЛНЕНА': 'done', 'НЕ ВЫПОЛНЕНА': 'not-done' };

/**
 * Why ownership was not settled. CLOSED list — each entry names a DIFFERENT repair:
 *   состав-единиц-не-известен — the fan-out is not planned yet; plan it, then assign
 *   разрезы-не-перечислены    — the splits happened but were not recorded; record them
 *   решение-отложено          — take the decision (this is the one that becomes a silent overwrite)
 *   вне-объёма                — decide it is out of scope and record the decision
 */
const REASONS = ['состав-единиц-не-известен', 'разрезы-не-перечислены', 'решение-отложено', 'вне-объёма'];

/** The one owner that is never a dispatched unit, and the one the field case was about. */
const COORDINATOR = 'координатор';

/** Spellings that mean "nobody" in an owner cell. `—` is the honest empty; the rest are the shapes
 *  people write when they mean the same thing, and collapsing them keeps the report about the
 *  missing owner rather than about punctuation. */
const NO_OWNER = /^(—|-|–|n\/a|нет|никто|\[.*\])?$/i;

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
    cannotCheck('в плане нет строки `**' + label + ':**`',
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
 * The body of one `## Heading` section — rows are read PER SECTION, never from the whole file.
 *
 * Three tables live in this document and two of them have a first column that looks like the other's.
 * A parser that scanned the file globally would read the units table as ownership rows and report a
 * unit as a file with no owner: an answer to a question nobody asked, delivered as a defect.
 */
function section(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => new RegExp('^#{2,6}\\s+' + heading + '\\s*$', 'i').test(l.trim()));
  if (start < 0) return null;
  const level = /^(#+)/.exec(lines[start].trim())[1].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s+\S/.exec(lines[i].trim());
    if (m && m[1].length <= level) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n');
}

/** Markdown table rows of a section, as arrays of trimmed cells. Header and `|---|` are skipped. */
function rows(body, headWord) {
  const out = [];
  if (!body) return out;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    cells.shift();
    if (cells.length && cells[cells.length - 1] === '') cells.pop();
    if (cells.length < 2) continue;
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    if (headWord && cells[0].toLowerCase() === headWord) continue;
    out.push(cells);
  }
  return out;
}

const norm = (s) => String(s || '').trim().replace(/^[`«"]|[`»"]$/g, '').trim();
const key = (s) => norm(s).toLowerCase();

function main() {
  const root = process.argv[2] || '.';
  try { if (!fs.statSync(root).isDirectory()) cannotCheck('это не каталог: ' + root); }
  catch { cannotCheck('путь не существует: ' + root); }

  const abs = path.join(root, PLAN);
  let text;
  try {
    if (!fs.statSync(abs).isFile()) cannotCheck(PLAN + ' существует, но это не файл');
    text = fs.readFileSync(abs, 'utf-8');
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      cannotCheck('нет файла ' + PLAN,
        'это значит, что вопрос о владении НЕ ЗАДАВАЛСЯ — а НЕ что писатель один; запуск без '
        + 'параллельных пишущих единиц отвечает `**Пишущий фан-аут:** нет`, и это законный ответ');
    }
    cannotCheck('не читается ' + PLAN + ': ' + ((e && e.message) || e));
  }

  // 1. A read-only fan-out owns nothing → 2, never 0.
  const writes = closedHeader(text, 'Пишущий фан-аут', WRITES,
    'без этой строки «фан-аут только читает» неотличимо от «про запись не подумали»');
  if (!writes) {
    cannotCheck('план говорит «Пишущий фан-аут: нет» — параллельные единицы ничего не пишут',
      'владение делится между ПИСАТЕЛЯМИ; у читающих проверяющих делить нечего');
  }

  // 2. A named refusal is honest and exits 2.
  const run = closedHeader(text, 'Проверка владения', RUN_STATUS,
    'без этой строки «не разбирали владение» неотличимо от «разобрали»');
  if (run === 'not-done') {
    const raw = header(text, 'Причина');
    if (raw === null || raw === '') {
      cannotCheck('проверка владения НЕ ВЫПОЛНЕНА без строки `**Причина:**`',
        'причина обязательна и берётся из закрытого списка: ' + REASONS.join(' | ')
        + ' — каждая означает СВОЙ ремонт');
    }
    const picked = REASONS.filter((r) => raw.includes(r));
    if (picked.length !== 1) {
      cannotCheck('причина «' + raw + '» не из закрытого списка (или названо сразу несколько)',
        'допустимы ровно: ' + REASONS.join(' | '));
    }
    cannotCheck('проверка владения НЕ ВЫПОЛНЕНА, причина: ' + picked[0],
      'честное «неизвестно», а не «у каждого файла один писатель»; пока причина не закрыта, '
      + 'второй писатель обнаружится либо конфликтом слияния, либо молча — перезаписью');
  }

  // 3. Who was dispatched. Their names are the only legal owners besides the coordinator.
  const units = rows(section(text, 'Единицы'), 'единица').map((c) => norm(c[0])).filter(Boolean);
  if (units.length === 0) {
    proven('объявлен пишущий фан-аут, но ни одна единица не названа',
      ['раздел `## Единицы` пуст или отсутствует'],
      'владение назначается ПИСАТЕЛЯМ; список писателей — это и есть список законных владельцев.');
  }
  const unitKeys = new Set(units.map(key));
  const dupUnits = [...new Set(units.map(key).filter((n, i, a) => a.indexOf(n) !== i))];
  if (dupUnits.length) {
    cannotCheck('в таблице единиц повторяются строки: ' + dupUnits.join(', '),
      'одна единица — одна строка; иначе владение приписано двум писателям под одним именем');
  }

  // 4. The ownership table itself.
  const ownRows = rows(section(text, 'Владение'), 'файл');
  if (ownRows.length === 0) {
    proven('объявлен пишущий фан-аут, но таблица владения пуста',
      ['раздел `## Владение` пуст или отсутствует'],
      'пустая таблица под «да» — доказанный пропуск, а не неизвестность: у файлов, которые никто '
      + 'не объявил своими, писатель всё равно найдётся, только назовёт его слияние.');
  }

  const owners = new Map();          // file → Set of owners
  for (const cells of ownRows) {
    const file = norm(cells[0]);
    const owner = norm(cells[1]);
    if (!file) continue;
    if (!owners.has(key(file))) owners.set(key(file), { file, set: new Map() });
    owners.get(key(file)).set.set(key(owner), owner);
  }

  const ownerless = [...owners.values()].filter((e) => [...e.set.keys()].some((o) => NO_OWNER.test(o)));
  if (ownerless.length) {
    proven('у файла в таблице владения не назван владелец', ownerless.map((e) => e.file),
      'файл без единственного писателя — это не «пока не решили», это решение по умолчанию: '
      + 'пишет тот, кто дошёл первым, и второй об этом не узнает.');
  }

  // 4a. THE FIXTURE: one file, two owners. Both authors are internally consistent; only the union
  //     of their edits is wrong, and the union is what nobody reads.
  const shared = [...owners.values()].filter((e) => e.set.size > 1);
  if (shared.length) {
    proven('у одного файла два владельца',
      shared.map((e) => e.file + ' → ' + [...e.set.values()].join(', ')),
      'два писателя по одному пути — это либо конфликт слияния, либо, что хуже, ТИХАЯ перезапись: '
      + 'оба прочитали старое содержимое, оба записали своё, второй выиграл, и оба отчитались об '
      + 'успехе. Атомарная запись этого не лечит — она лечит рваный файл, а не потерянную правку.');
  }

  // 4b. An owner nobody dispatched. A file assigned to a writer who is not in the run has, in
  //     practice, no writer at all — and reads as if it had one.
  const strangers = [];
  for (const e of owners.values()) {
    for (const owner of e.set.values()) {
      if (key(owner) === COORDINATOR) continue;
      if (!unitKeys.has(key(owner))) strangers.push(e.file + ' → ' + owner);
    }
  }
  if (strangers.length) {
    proven('владелец не назван среди диспатчируемых единиц', strangers,
      'владельцем может быть либо единица из `## Единицы`, либо `' + COORDINATOR + '`. Имя, '
      + 'которого нет в диспатче, назначает файл тому, кто в прогоне не участвует, — то есть никому.');
  }

  // 4c. A dispatched unit that owns nothing writes somewhere anyway. Totality has two directions,
  //     and this is the one a table naturally forgets.
  const ownedBy = new Set([...owners.values()].flatMap((e) => [...e.set.keys()]));
  const idle = units.filter((u) => !ownedBy.has(key(u)));
  if (idle.length) {
    proven('единица диспатчирована на запись, но не владеет ни одним файлом', idle,
      'она всё равно что-то запишет — просто путь этой записи не объявлен, и столкнуться он '
      + 'может с чем угодно. Назовите файлы, за которые она отвечает, либо уберите её из '
      + 'пишущего фан-аута.');
  }

  // 5. The coordinator MUST answer for itself. It is the one writer nobody dispatched, and it is
  //    the one that wrote in the measured field case.
  const coordWrites = closedHeader(text, 'Координатор пишет', COORD_WRITES,
    'координатор — единственный писатель, которого никто не диспатчировал');
  const coordOwns = [...owners.values()].filter((e) => e.set.has(COORDINATOR)).map((e) => e.file);
  if (coordWrites && coordOwns.length === 0) {
    proven('координатор объявлен пишущим, но не владеет ни одним файлом',
      ['`**Координатор пишет:** да`, а строк с владельцем `' + COORDINATOR + '` в таблице нет'],
      'таблица, перечисляющая всех, кроме координатора, тотальна для всех, кроме автора дефекта: '
      + 'именно координатор в измеренном случае вписал в свежий файл абзац о праве, которое '
      + 'владелец исходного файла в те же минуты отзывал в соседнем документе.');
  }
  if (!coordWrites && coordOwns.length > 0) {
    proven('координатор объявлен непишущим, но владеет файлами', coordOwns,
      'объявление и таблица противоречат друг другу, и читатель поверит объявлению: «координатор '
      + 'не пишет» — ровно то допущение, под которым второй писатель остаётся незамеченным.');
  }

  // 6. THE LOAD-BEARING HALF: ownership at the moment of the SPLIT.
  const hasSplits = closedHeader(text, 'Разрезы файлов', SPLITS,
    'отсутствующий раздел прочитался бы как «разрезов не было»');
  const splitRows = rows(section(text, 'События разреза'), 'новый файл');
  if (hasSplits && splitRows.length === 0) {
    proven('объявлены разрезы файлов, но ни один не назван',
      ['раздел `## События разреза` пуст или отсутствует'],
      'файл, родившийся разрезом, не наследует владельца НИ ОТ КОГО — владение не переносится '
      + 'само. Неперечисленный разрез — это неназначенный владелец, записанный так, будто разреза '
      + 'не было.');
  }
  if (!hasSplits && splitRows.length > 0) {
    cannotCheck('`Разрезы файлов: нет`, но таблица разрезов не пуста',
      'объявление и таблица противоречат друг другу — какое из двух верно, отсюда не видно');
  }

  const bornWithoutOwner = [];
  const disagree = [];
  const unowned = [];
  for (const cells of splitRows) {
    const born = norm(cells[0]);
    const from = norm(cells[1]);
    const owner = norm(cells[2] || '');
    if (!born) continue;
    if (NO_OWNER.test(key(owner))) { bornWithoutOwner.push(born + ' ← ' + (from || '?')); continue; }
    const entry = owners.get(key(born));
    if (!entry) { unowned.push(born + ' ← ' + (from || '?')); continue; }
    if (!entry.set.has(key(owner))) {
      disagree.push(born + ': при разрезе `' + owner + '`, в таблице владения `'
        + [...entry.set.values()].join(', ') + '`');
    }
  }
  if (bornWithoutOwner.length) {
    proven('файл создан разрезом БЕЗ владельца', bornWithoutOwner,
      'владение не переносится само: у нового документа в момент рождения нет ни одного писателя, '
      + 'и назначить его надо ТОГДА ЖЕ. Создание без владельца — это дефект, а не отложенное '
      + 'решение; отложенное решение здесь неотличимо от принятого в пользу «пишут все».');
  }
  if (unowned.length) {
    proven('файл создан разрезом и не попал в таблицу владения', unowned,
      'строка разреза назвала владельца, а таблица владения о таком файле не знает: у прогона два '
      + 'ответа на один вопрос, и вторая половина прогона прочитает второй.');
  }
  if (disagree.length) {
    proven('владелец разреза противоречит таблице владения', disagree,
      'два объявления об одном файле, и они разные. Пока они не сведены, «кто пишет» зависит от '
      + 'того, какое из них прочитал исполнитель.');
  }

  say('✅ владение тотально и однозначно: ' + owners.size + ' файл(ов), ' + units.length
    + ' единиц(ы), координатор ' + (coordWrites ? 'пишет и назван' : 'объявлен непишущим'));
  say('   Разрезов: ' + splitRows.length + (splitRows.length
    ? ' — у каждого владелец назначен в момент создания и совпадает с таблицей' : ' (объявлено «нет»)'));
  say('   Ограничение: это проверка ДЕКЛАРАЦИИ. Координатор, правящий чужой файл в обход '
    + 'протокола, оставляет план неизменным и эту проверку зелёной; полной проверки слоя 1 здесь '
    + 'не существует без атрибуции записи.');
  process.exit(0);
}

try {
  main();
} catch (err) {
  // Even an unexpected failure must not read as "clean".
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err));
}
