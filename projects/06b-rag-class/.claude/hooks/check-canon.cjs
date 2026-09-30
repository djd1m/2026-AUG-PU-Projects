#!/usr/bin/env node
'use strict';

/**
 * check-canon.cjs — перед ПИШУЩИМ фан-аутом канон зафиксирован, и он ещё цел?
 *
 * NOT an event hook. Like `check-ports.cjs`, `check-look-trace.cjs`, `check-growth-trace.cjs`,
 * `check-docs-complete.cjs`, `check-swarm-receipts.cjs`, `check-embed-contract.cjs`,
 * `check-webhook-contract.cjs`, `check-job-contract.cjs` and `check-model-cost.cjs`, it lives here
 * because this directory already carries plain Node utilities; nothing registers it in
 * settings.json. That is deliberate: this package's hooks are NON-BLOCKING by contract (pinned by
 * tests/unit/hooks-project-anchored.test.js, which requires exit 0), so a hook could never refuse
 * anything — it could only print. Invoke it:
 *
 *   node .claude/hooks/check-canon.cjs [path-to-project]
 *
 * WHY IT EXISTS — the failure, before the technology.
 *
 * N parallel workers derive names from ONE source document. Each worker is internally consistent:
 * it reads the source, picks a model name, an enum value, a route path, a step number, and writes
 * code that agrees with itself. The COLLISION does not exist inside any worker — it exists only in
 * the UNION of their outputs. So no worker can see it, and no delivery receipt can catch it: every
 * receipt is a truthful report about a file that is individually fine.
 *
 * THE SCOPE IS NARROW ON PURPOSE, and the narrowing is the whole reason this check is legitimate.
 * It applies to a fan-out that WRITES — `/start` Phase 2 (one independent Task per package, each
 * told to generate `src/`, `tests/`, routes and an ORM schema) and `/feature` Phase 3 (implement +
 * write tests + commit). It does NOT apply to `/replicate`, whose fan-out is read-only validators:
 * a checker family proposed for "freeze the canon before every fan-out" was refused twice, and
 * refused CORRECTLY, because read-only reviewers cannot collide. Do not widen this.
 *
 * MEASURED — this repository, 2026-09-01, three swarms on one package with no canon pinned:
 *   · two DIFFERENT steps carried the number «Шаг 2.2», on the same line of two worktrees;
 *   · two adjacent lines both signed «All 13 rules», one listing 12 names and the other 11, with
 *     13 on disk — a list that split in half and lied on both halves;
 *   · a budget marker was moved to three different values by three swarms;
 *   · 23 merge conflicts in the second branch, 17 in the first, and 6 test failures on the merged
 *     tree from suites that were green individually.
 *
 * THE ASYMMETRY THAT DECIDES THE CURE, same package, same merge, same day: the hook counter (17)
 * is pinned by a UNIT TEST and survived the merge intact; the rule counter (13) lived in PROSE and
 * split in two. One repository, one cause, two outcomes. That is why the cure here is a check and
 * not another paragraph — a counter with a layer-1 guard held, a counter guarded by reading did not.
 *
 * WHAT THIS FILE CAN AND CANNOT DECIDE — read before trusting exit 0.
 *
 * It reads a DECLARATION, `docs/dispatch-plan.md`, plus the canon file that declaration points at,
 * and it settles exactly three things:
 *
 *   1. the canon is PINNED — named, readable, and its live sha256 equals the recorded one, so the
 *      document the workers were sent to has not moved under them;
 *   2. inside the canon, no two SIBLING headings carry the same ordinal — an ordinal that repeats
 *      under one parent cannot address anything, which is the «Шаг 2.2» defect exactly;
 *   3. inside the canon, an enumeration that CLAIMS a count delivers that count, and two claims
 *      about the same population do not disagree — the «All 13 rules» defect exactly.
 *
 * It does NOT decide COMPLETENESS. A matching hash proves the canon did not change; it says nothing
 * about whether the canon enumerated every shared choice the workers will have to make. That half
 * stays layer 3 (a coordinator's judgement recorded at the seam) and this file says so out loud
 * rather than letting a green exit imply it.
 *
 * THE EXACT FORM OF `docs/dispatch-plan.md` — kept here on purpose: this file is not part of the
 * always-loaded corpus, so the long form costs nothing per run.
 *
 *   **Пишущий фан-аут:** да              (да | нет — `нет` is a legitimate answer)
 *   **Канон:** docs/canon.md             (path, relative to the project root)
 *   **Хеш канона:** <64 hex>             (sha256 of that file at the moment it was frozen)
 *   **Проверка канона:** ВЫПОЛНЕНА       (ВЫПОЛНЕНА | НЕ ВЫПОЛНЕНА)
 *   **Причина:** —                       (required when НЕ ВЫПОЛНЕНА; one of the closed REASONS)
 *
 *   ## Единицы
 *
 *   | Единица | Что пишет |
 *   |---|---|
 *   | packages/api | src/api/**, tests/api/** |
 *   | packages/web | src/web/**, tests/web/** |
 *
 * Exit codes — three, and the third is the point:
 *   0  two or more writing units, a canon that is pinned and still matches, no ordinal collision,
 *      no contradicted count
 *   1  a defect is PROVEN and named: a writing fan-out with no canon named, a canon path that does
 *      not exist, a recorded hash that no longer matches the file, two sibling headings under one
 *      ordinal, a count claim contradicted by its own list, or two claims about one population
 *      that disagree
 *   2  THE CHECK DID NOT RUN — no plan, an unrecognised value, a malformed hash, duplicate unit
 *      rows, or the legitimate answers «пишущего фан-аута нет», «единица одна» (a sequential run
 *      cannot collide in a union of one) and «проверка НЕ ВЫПОЛНЕНА, причина такая-то»
 *
 * A checker that answers "clean" when it could not look converts an unknown into a reassurance.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PLAN = path.join('docs', 'dispatch-plan.md');

/** Does this dispatch WRITE? A CLOSED set. `нет` is legitimate and exits 2: a read-only fan-out
 *  (the `/replicate` validators) cannot produce a collision, so there is nothing here to pin. */
const WRITES = { 'ДА': true, 'НЕТ': false };

/** Was the canon actually frozen? CLOSED, and the negative answer is honest rather than a failure —
 *  `honest-configuration` CFG-I4: an unreachable truth yields UNKNOWN, never a plausible value. */
const RUN_STATUS = { 'ВЫПОЛНЕНА': 'done', 'НЕ ВЫПОЛНЕНА': 'not-done' };

/**
 * Why the canon was not frozen. CLOSED list — free text is not a reason here, because the whole
 * value of the list is that each entry names a DIFFERENT repair:
 *   канон-не-собран      — assemble the shared names, then re-check
 *   источник-недоступен  — get the source document, then pin it
 *   решение-отложено     — take the decision (this is the one that quietly becomes a merge conflict)
 *   вне-объёма           — decide it is out of scope and record the decision
 */
const REASONS = ['канон-не-собран', 'источник-недоступен', 'решение-отложено', 'вне-объёма'];

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

/**
 * The value of a `**Label:** value` header line, or null when the label is absent entirely.
 * An EMPTY value is returned as '' and is never collapsed into "absent" — those are different
 * mistakes with different repairs (`honest-configuration` CFG-I2).
 */
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
 * The unit table, as the plan records it.
 *
 * A row is a markdown table row with at least two cells whose FIRST cell is neither the header word
 * nor a `|---|` separator — so the header row cannot be mistaken for data, and a unit that names no
 * written path is reported rather than silently dropped.
 */
function unitRows(text) {
  const rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;                    // '' + 2 columns + ''
    const name = cells[1];
    if (!name || /^:?-+:?$/.test(name)) continue;
    if (name.toLowerCase() === 'единица') continue;
    rows.push({ name, writes: cells[2] });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// The canon's own two defects. Both are read STRUCTURALLY, never by a global regular expression:
// a global pattern answers "does this string appear twice in the file", which is a DIFFERENT
// question from the one that matters — "can a reader address this number / does this list keep its
// own promise" — and answering the wrong question is the very defect class this family exists for.
// ---------------------------------------------------------------------------

/**
 * Headings of a markdown document, each with its LEVEL, its ordinal (if any) and its body.
 *
 * The body is everything until the next heading of the same or lower level, so «two headings, same
 * ordinal, different bodies» can be decided by comparison rather than by guessing.
 *
 * Fenced code blocks are skipped: a `#` inside a shell example is a comment, not a heading, and a
 * parser that cannot tell them apart invents siblings that do not exist.
 */
function headings(text) {
  const lines = text.split('\n');
  const found = [];
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (!m) continue;
    found.push({ level: m[1].length, title: m[2], line: i + 1, start: i });
  }
  for (let i = 0; i < found.length; i++) {
    let end = lines.length;
    for (let j = i + 1; j < found.length; j++) {
      if (found[j].level <= found[i].level) { end = found[j].start; break; }
    }
    found[i].body = lines.slice(found[i].start + 1, end).join('\n').trim();
  }
  return found;
}

/**
 * The ordinal a heading claims, or null.
 *
 * Only a DOTTED numeral counts — `2.2`, `10.3.1`. A bare `2` is deliberately excluded: `## 2 файла`
 * and `### Шаг 2` are ordinary prose in these documents, and firing on them would make the check
 * eager, which is how a guard becomes a deleted guard. The measured defect was a dotted step
 * number, and that is what is claimed here.
 */
function ordinalOf(title) {
  const m = /(?:^|[\s(«"`])(\d+(?:\.\d+)+)(?=[\s.:—–\-)»"`]|$)/.exec(title);
  return m ? m[1] : null;
}

/** The nearest preceding heading of a LOWER level — the parent whose scope the ordinal lives in. */
function parentKey(list, index) {
  for (let j = index - 1; j >= 0; j--) {
    if (list[j].level < list[index].level) return list[j].line + ':' + list[j].title;
  }
  return '(корень документа)';
}

/**
 * Sibling headings that claim the same ordinal.
 *
 * SCOPE IS THE POINT. `Шаг 2.2` under «Фаза A» and `Шаг 2.2` under «Фаза B» are two different,
 * perfectly addressable steps; the same two under ONE parent are a number that addresses nothing.
 * A global search cannot tell those apart and would refuse the legitimate document.
 */
function ordinalCollisions(text) {
  const list = headings(text);
  const buckets = new Map();
  for (let i = 0; i < list.length; i++) {
    const ord = ordinalOf(list[i].title);
    if (!ord) continue;
    const key = parentKey(list, i) + ' ⟶ ' + list[i].level + ' ⟶ ' + ord;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(list[i]);
  }
  const out = [];
  for (const group of buckets.values()) {
    if (group.length < 2) continue;
    const bodiesDiffer = new Set(group.map((h) => h.body)).size > 1;
    out.push({
      ordinal: ordinalOf(group[0].title),
      bodiesDiffer,
      where: group.map((h) => 'строка ' + h.line + ': «' + h.title + '»'),
    });
  }
  return out;
}

/**
 * Enumerations that state their own size: `- All 13 rules: \`a\`, \`b\`, …`.
 *
 * The list is parsed as a LIST — comma-separated items after the colon — rather than counted by a
 * pattern over the whole line. `All 10 skills in .claude/skills/` has no colon-introduced list and
 * is therefore not an enumeration at all: it claims a number without enumerating, which is a
 * different (and unfalsifiable-here) thing, so it is left alone instead of being guessed at.
 */
function countClaims(text) {
  const claims = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /(?:^|[\s*_>-])(?:All|Все|Всего)\s+(\d+)\s+([^:]{1,40}?):\s*(\S.*)$/.exec(lines[i]);
    if (!m) continue;
    const items = m[3].split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    if (items.length === 0) continue;
    claims.push({
      line: i + 1,
      declared: Number(m[1]),
      label: m[2].trim().toLowerCase().replace(/\s+/g, ' '),
      items,
      counted: items.length,
    });
  }
  return claims;
}

/** A claim whose own list contradicts its number. */
function brokenCounts(claims) {
  return claims.filter((c) => c.declared !== c.counted);
}

/**
 * Two claims about the SAME population that disagree about its members.
 *
 * This is the predicate that survives when the counts happen to be right. The measured defect had
 * two lines both signed «All 13 rules» with different lists; had both lists carried 13 names, the
 * count check would have passed and the document would still have contradicted itself. Split
 * knowledge is the failure — not arithmetic.
 */
function contradictedClaims(claims) {
  const byLabel = new Map();
  for (const c of claims) {
    if (!byLabel.has(c.label)) byLabel.set(c.label, []);
    byLabel.get(c.label).push(c);
  }
  const out = [];
  for (const [label, group] of byLabel) {
    if (group.length < 2) continue;
    const norm = (c) => c.items.map((s) => s.replace(/[`'"*]/g, '').trim().toLowerCase()).sort().join('|');
    if (new Set(group.map(norm)).size > 1) {
      out.push({ label, where: group.map((c) => 'строка ' + c.line + ': ' + c.counted + ' имён') });
    }
  }
  return out;
}

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
        'это значит, что вопрос о каноне НЕ ЗАДАВАЛСЯ — а НЕ что фан-аута нет; запуск без '
        + 'параллельных пишущих единиц отвечает `**Пишущий фан-аут:** нет`, и это законный ответ');
    }
    cannotCheck('не читается ' + PLAN + ': ' + ((e && e.message) || e));
  }

  // 1. Does this dispatch write at all? A read-only fan-out cannot collide → 2, never 0.
  const writes = closedHeader(text, 'Пишущий фан-аут', WRITES,
    'без этой строки «фан-аут только читает» неотличимо от «про запись не подумали»');
  if (!writes) {
    cannotCheck('план говорит «Пишущий фан-аут: нет» — параллельные единицы ничего не пишут',
      'это законный ответ, а не нарушение: столкновение имён существует только в ОБЪЕДИНЕНИИ '
      + 'записей, а у читающих проверяющих объединения записей нет. Фиксировать нечего.');
  }

  // 2. Was the canon frozen? A named refusal is honest and exits 2.
  const run = closedHeader(text, 'Проверка канона', RUN_STATUS,
    'без этой строки «не фиксировали» неотличимо от «зафиксировали»');
  if (run === 'not-done') {
    const raw = header(text, 'Причина');
    if (raw === null || raw === '') {
      cannotCheck('фиксация канона НЕ ВЫПОЛНЕНА без строки `**Причина:**`',
        'причина обязательна и берётся из закрытого списка: ' + REASONS.join(' | ')
        + ' — каждая означает СВОЙ ремонт');
    }
    const picked = REASONS.filter((r) => raw.includes(r));
    if (picked.length !== 1) {
      cannotCheck('причина «' + raw + '» не из закрытого списка (или названо сразу несколько)',
        'допустимы ровно: ' + REASONS.join(' | '));
    }
    cannotCheck('фиксация канона НЕ ВЫПОЛНЕНА, причина: ' + picked[0],
      'честное «неизвестно», а не «канон зафиксирован»; пока причина не закрыта, каждая '
      + 'параллельная единица изобретает имена заново, и увидит это только слияние');
  }

  // 3. The units. One unit is a sequential run: a union of one has nothing to collide with.
  const rows = unitRows(text);
  if (rows.length === 0) {
    proven('объявлен пишущий фан-аут, но ни одна единица не названа',
      ['таблица `## Единицы` пуста'],
      'нельзя зафиксировать канон для писателей, которых нет в списке. Пустая таблица под «да» — '
      + 'доказанный пропуск, а не неизвестность.');
  }
  const names = rows.map((r) => r.name.toLowerCase());
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  if (dupes.length) {
    cannotCheck('в таблице единиц повторяются строки: ' + dupes.join(', '),
      'одна единица — одна строка; иначе один канон приписан двум разным писателям под одним именем');
  }
  if (rows.length === 1) {
    cannotCheck('в плане одна пишущая единица — это последовательный запуск',
      'столкновение имён существует ТОЛЬКО в объединении параллельных записей; у объединения из '
      + 'одной записи его быть не может. Последовательный запуск — законная альтернатива '
      + 'зафиксированному канону, а не обход проверки.');
  }

  // 4. THE LOAD-BEARING CHECK. Two or more writers ⇒ the canon must be NAMED and PINNED.
  const canonRel = header(text, 'Канон');
  if (canonRel === null || canonRel === '') {
    proven('' + rows.length + ' параллельных пишущих единиц, а канон не назван',
      rows.map((r) => r.name),
      'каждая единица выведет имена моделей, значения перечислений, пути маршрутов и порядковые '
      + 'номера из общего источника самостоятельно — и будет внутри себя права. Столкновение '
      + 'появится только при слиянии, где его уже никто не относит к диспатчу.');
  }
  const canonAbs = path.join(root, canonRel);
  let canonBytes;
  try {
    if (!fs.statSync(canonAbs).isFile()) {
      proven('канон назван, но это не файл', [canonRel], 'закрепление за несуществующим объектом ' +
        'ничего не закрепляет.');
    }
    canonBytes = fs.readFileSync(canonAbs);
  } catch {
    proven('канон назван, но не читается', [canonRel],
      'план ссылается на документ, которого нет: пин указывает в пустоту, а исполнители при этом '
      + 'получили ссылку и будут считать её действующей.');
  }

  const declared = header(text, 'Хеш канона');
  if (declared === null || declared === '') {
    proven('канон назван, но его хеш не записан', [canonRel],
      'без записанного хеша «канон не менялся» и «канон переписали после диспатча» выглядят '
      + 'одинаково: путь остаётся тем же в обоих случаях.');
  }
  if (!HEX64.test(declared)) {
    cannotCheck('`Хеш канона` не похож на sha256: ' + declared,
      'нужны ровно 64 шестнадцатеричных знака — `sha256sum ' + canonRel + '`');
  }
  const live = crypto.createHash('sha256').update(canonBytes).digest('hex');
  if (live.toLowerCase() !== declared.toLowerCase()) {
    proven('канон изменился после фиксации',
      [canonRel, 'записано: ' + declared.toLowerCase(), 'на диске: ' + live],
      'исполнители получили ссылку на документ, который с тех пор переписали: часть из них решает '
      + 'по старой редакции, часть по новой, и обе половины внутри себя последовательны. '
      + 'Перефиксируйте канон и перезапустите диспатч — либо верните файл к записанному состоянию.');
  }

  // 5. The canon's own consistency. A frozen document that contradicts itself freezes the collision.
  const canonText = canonBytes.toString('utf-8');

  const collisions = ordinalCollisions(canonText);
  if (collisions.length) {
    const lines = [];
    for (const c of collisions) {
      lines.push('порядковый номер ' + c.ordinal
        + (c.bodiesDiffer ? ' у ДВУХ РАЗНЫХ разделов' : ' повторён дословно') + ':');
      for (const w of c.where) lines.push('    ' + w);
    }
    proven('в каноне один порядковый номер у соседних разделов', lines,
      'номер существует, чтобы на него можно было СОСЛАТЬСЯ. Два соседа под одним номером делают '
      + 'ссылку неразрешимой, а при слиянии двух веток — молчаливой: обе стороны правы у себя. '
      + 'Перенумеруйте один из них.');
  }

  const claims = countClaims(canonText);
  const broken = brokenCounts(claims);
  if (broken.length) {
    proven('в каноне перечень противоречит собственному числу',
      broken.map((c) => 'строка ' + c.line + ': заявлено ' + c.declared + ' («' + c.label
        + '»), перечислено ' + c.counted),
      'число рядом с перечнем читается как проверка перечня. Когда они расходятся, читатель верит '
      + 'числу, а работает по перечню — и расхождение переживает и ревью, и слияние.');
  }
  const contradicted = contradictedClaims(claims);
  if (contradicted.length) {
    const lines = [];
    for (const c of contradicted) {
      lines.push('«' + c.label + '» перечислено по-разному:');
      for (const w of c.where) lines.push('    ' + w);
    }
    proven('в каноне два перечня об одном и том же не совпадают', lines,
      'это подпись слияния без канона: две ветки правили один перечень, обе оставили свою версию, '
      + 'и ни одна из них не полна. Оставьте ОДИН перечень и ссылайтесь на него.');
  }

  say('✅ канон зафиксирован и цел: ' + canonRel + ' (sha256 совпал), '
    + rows.length + ' параллельных пишущих единиц');
  say('   Проверено внутри канона: порядковые номера различимы у соседей ('
    + headings(canonText).length + ' заголовков), перечни держат своё число (' + claims.length + ')');
  say('   Ограничение: совпавший хеш доказывает, что канон НЕ МЕНЯЛСЯ, — но не то, что он перечислил '
    + 'все разделяемые выборы. Полнота канона остаётся суждением координатора (слой 3).');
  process.exit(0);
}

try {
  main();
} catch (err) {
  // Even an unexpected failure must not read as "clean".
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err));
}
