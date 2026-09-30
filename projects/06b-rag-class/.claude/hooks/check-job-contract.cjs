#!/usr/bin/env node
'use strict';

/**
 * check-job-contract.cjs — долгая работа: у неё есть ручка, три состояния и продолжение?
 *
 * NOT an event hook. Like `check-ports.cjs`, `check-look-trace.cjs`, `check-growth-trace.cjs`,
 * `check-docs-complete.cjs`, `check-swarm-receipts.cjs` and `check-embed-contract.cjs`, it lives
 * here because this directory already carries plain Node utilities; nothing registers it in
 * settings.json. That is deliberate: this package's hooks are NON-BLOCKING by contract (pinned by
 * tests/unit/hooks-project-anchored.test.js, which requires exit 0), so a hook could never refuse
 * anything — it could only print. Invoke it:
 *
 *   node .claude/hooks/check-job-contract.cjs [path-to-project]
 *
 * WHY IT EXISTS — the failure, before the technology.
 *
 * Some products do work that takes MINUTES, not milliseconds: transcribe an hour of audio and cut
 * it, generate an image, render a video. A plain request-response over the web cannot carry that BY
 * CONSTRUCTION, and the three ways it breaks are all the SAME confusion — NO ANSWER is not the same
 * fact as STILL RUNNING, and a design that spells them identically cannot tell them apart later:
 *
 *   1. РАЗРЫВ        an intermediary (proxy, load balancer, CDN, the browser itself) drops the
 *                    request at its idle timeout. The work COMPLETED; the answer had nowhere to go.
 *                    The user sees an error over money that was actually spent.
 *   2. ПОВТОР-ЗАНОВО the client retries and the server STARTS AGAIN instead of continuing, so the
 *                    external bill doubles per attempt. This is kin to webhook redelivery, but the
 *                    mechanism differs: there the repeat arrives from OUTSIDE; here your own client
 *                    initiates it. The neighbouring rule about INBOUND webhooks owns that half.
 *   3. ТРЕТЬЯ-КОПИЯ  the user cannot see any state, presses the button again, and a third copy of
 *                    the same work starts.
 *
 * All three descend from one indistinguishability: silence is produced EQUALLY by a live job, a
 * dead worker and a broken intermediary. Read silence as «running» and a dead job waits forever,
 * a retry doubles the bill, and the user is told nothing.
 *
 * WHAT THIS FILE CAN AND CANNOT DECIDE — read before trusting exit 0.
 *
 * It reads a DECLARATION, `docs/long-job-contract.md`, and decides only what a declaration can
 * settle: that the handle exists and is issued BEFORE the work rather than with its result, that
 * the three states are all answered and are DIFFERENT to the user, that silence is declared UNKNOWN
 * and not RUNNING, and that a repeat continues by a NAMED mechanism. It does not run a job, does not
 * cut a connection and does not prove the server survives a real disconnect. That half is layer 3/4
 * and the rule `.claude/rules/long-running-job.md` says so in the same words.
 *
 * THE EXACT FORM OF `docs/long-job-contract.md` — the rule delegates it here on purpose: this file
 * is not part of the always-loaded corpus, so the long form costs nothing per run, while the rule
 * keeps only the decision the reader must carry.
 *
 *   **Долгие задачи:** да                  (да | нет — `нет` is a legitimate answer)
 *   **Идентификатор задачи:** job_id       (a FIELD NAME, not a description)
 *   **Где живёт:** ответ `POST /api/clips` → поле `job_id`; чтение `GET /api/jobs/{job_id}`
 *   **Выдаётся:** до начала работы         (до начала работы | после завершения)
 *   **Ответ на создание:** идентификатор   (идентификатор | результат)
 *   **Предельное время задачи:** 15 мин    (a number AND a unit)
 *   **Таймаут посредника:** 60 с           (the SHORTEST timeout on the path to the client)
 *   **Молчание:** неизвестно               (неизвестно | выполняется)
 *   **Продолжение при повторе:** идемпотентный-ключ
 *   **Проверка выполнена:** ВЫПОЛНЕНА      (ВЫПОЛНЕНА | НЕ ВЫПОЛНЕНА)
 *   **Причина:** —          (required when НЕ ВЫПОЛНЕНА; one of the closed REASONS below)
 *
 *   ## Состояния
 *
 *   | Состояние | Статус | Что видит пользователь | Доказательство |
 *   |---|---|---|---|
 *   | выполняется | ПРОВЕРЕН | «идёт нарезка, 2 из 7» | GET /api/jobs/j-42 → {"state":"running"}, job_id=j-42, 2026-09-01 |
 *   | успех | ПРОВЕРЕН | список готовых клипов со ссылками | GET /api/jobs/j-42 → {"state":"done"}, job_id=j-42, 2026-09-01 |
 *   | отказ | ПРОВЕРЕН | «нарезка не удалась: ffmpeg код 1» + кнопка «повторить» | GET /api/jobs/j-43 → {"state":"failed"}, job_id=j-43, 2026-09-01 |
 *
 * Exit codes — three, and the third is the point:
 *   0  the handle is issued before the work, all three states are answered and DIFFER to the user,
 *      every proof names the identifier, and a repeat continues by a named mechanism
 *   1  a defect is PROVEN and named: silence declared as «выполняется», an identifier issued only
 *      with the result, a repeat that restarts, a missing state, two states the user cannot tell
 *      apart, a `ПРОВЕРЕН` row whose proof does not name the identifier, or a synchronous answer to
 *      work that cannot fit inside the intermediary's window
 *   2  THE CHECK DID NOT RUN — no contract, an unrecognised value, a duration without a unit, and
 *      the legitimate answers «нет долгих задач» / «проверка НЕ ВЫПОЛНЕНА, причина такая-то» /
 *      «работа укладывается в окно посредника, требовать нечего»
 *
 * TWO deliberate asymmetries, both named so they are not mistaken for oversights:
 *
 *   A PROVEN defect OUTRANKS an unanswered question: the four single-comparison defects are decided
 *   BEFORE the state table is parsed, so a malformed table cannot hide a declared «молчание =
 *   выполняется». `1` beats `2`, exactly as in check-look-trace.cjs.
 *
 *   The BOUNDED exception: answering synchronously is legal when the declared ceiling is strictly
 *   SHORTER than the intermediary's window — a three-second job behind a sixty-second proxy really
 *   does fit. Without that exception the check would be a permanent `1` for every product that has
 *   one slow-ish endpoint, and a check that refuses the correct configuration gets switched off.
 *   The escape it leaves is visible, not silent: an understated ceiling is a lie IN THE DECLARATION,
 *   and both numbers are printed next to the verdict every time.
 *
 * A checker that answers "clean" when it could not look converts an unknown into a reassurance —
 * which for this feature is the exact charge-the-user-for-a-lost-result outage it exists to prevent.
 */

const fs = require('node:fs');
const path = require('node:path');

const CONTRACT = path.join('docs', 'long-job-contract.md');

/** Does the product run work that outlives a request at all? A CLOSED set — `нет` is legitimate and
 *  it exits 2, never 0: there is nothing to check, and «нечего проверять» must not be spelled the
 *  same way as «проверено». */
const LONG = { 'ДА': true, 'НЕТ': false };

/** Was the check performed? CLOSED, and the negative answer is honest, not a failure: CFG-I4 of
 *  `honest-configuration` — an unreachable truth yields UNKNOWN, never a plausible value. */
const RUN_STATUS = { 'ВЫПОЛНЕНА': 'done', 'НЕ ВЫПОЛНЕНА': 'not-done' };

/**
 * Why the check did not happen. CLOSED list — free text is not a reason here, because the entire
 * value of the list is that each entry names a DIFFERENT repair:
 *   no-worker   — start the background worker    · not-deployed — deploy, then re-check
 *   no-long-run — no job long enough to observe  · out-of-scope — decide and record the decision
 */
const REASONS = ['no-worker', 'not-deployed', 'no-long-run', 'out-of-scope'];

/**
 * WHEN the client receives its handle. This is the whole of failure class 1 in one field: an
 * identifier that arrives only WITH the result dies with the response that was cut, and the client
 * is left with completed work it can never ask about again.
 */
const ISSUED = { 'ДО НАЧАЛА РАБОТЫ': 'before', 'ПОСЛЕ ЗАВЕРШЕНИЯ': 'after' };

/** What the create call returns. `результат` IS the synchronous request-response under another
 *  name, and it is bounded by the ceiling-vs-window comparison, not refused outright. */
const CREATE = { 'ИДЕНТИФИКАТОР': 'id', 'РЕЗУЛЬТАТ': 'result' };

/**
 * How the SILENCE is read. The single most load-bearing field in the contract.
 *
 * A live job, a dead worker and a severed proxy are all silent; only a state READ tells them apart.
 * Declaring silence as «выполняется» is not optimism, it is the erasure of the third state, and it
 * is what makes a dead job wait forever while the user starts a second copy.
 */
const SILENCE = { 'НЕИЗВЕСТНО': 'unknown', 'ВЫПОЛНЯЕТСЯ': 'running' };

/**
 * What makes a repeat CONTINUE instead of starting over. CLOSED, each entry a different repair, and
 * `нет` is a spellable answer precisely so the defect can be declared and then NAMED:
 *   идемпотентный-ключ — the same key from the client returns the SAME job, never a second one
 *   запись-в-хранилище — the job row is the source of truth; a repeat with the same id reads it
 *   аренда-исполнителя — a lease stops a second worker from picking up a job already taken
 *   нет                — the repeat starts the work again: failure class 2, declared
 */
const RESUME = {
  'ИДЕМПОТЕНТНЫЙ-КЛЮЧ': 'idempotency-key',
  'ЗАПИСЬ-В-ХРАНИЛИЩЕ': 'stored-record',
  'АРЕНДА-ИСПОЛНИТЕЛЯ': 'worker-lease',
  'НЕТ': 'none',
};

/**
 * The three states, as a CLOSED and MANDATORY set.
 *
 * Mandatory is the load-bearing half. TWO states are the defect this rule exists for: with only
 * «идёт» and «готово», a failure has nowhere to be reported and is served to the user as eternal
 * progress. Two of three answered is not an unknown — it is a PROVEN omission we can name.
 */
const STATES = ['выполняется', 'успех', 'отказ'];

/** Per-state verdict. CLOSED: an unmapped spelling is refused and the recognised ones printed. */
const STATE_STATUS = { 'ПРОВЕРЕН': 'checked', 'НЕ ПРОВЕРЕН': 'unchecked' };

/** Time units. A bare number is REFUSED: «60» is sixty seconds and sixty minutes written the same
 *  way, and the whole comparison this file makes is between two durations. */
const UNITS = {
  'с': 1, 'сек': 1, 'секунда': 1, 'секунды': 1, 'секунд': 1, 's': 1, 'sec': 1,
  'мин': 60, 'минута': 60, 'минуты': 60, 'минут': 60, 'm': 60, 'min': 60,
  'ч': 3600, 'час': 3600, 'часа': 3600, 'часов': 3600, 'h': 3600,
};

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
 * A duration in SECONDS, or null when it is not a number-plus-unit.
 *
 * The unit is mandatory and the reason is the comparison this file exists to make: the ceiling and
 * the intermediary window are compared to each other, and a unitless number makes that comparison
 * a coin toss with a printed verdict.
 */
function seconds(raw) {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([A-Za-zА-Яа-яЁё]+)\s*$/.exec(String(raw || ''));
  if (!m) return null;
  const unit = m[2].toLowerCase().replace(/ё/g, 'е');
  if (!Object.prototype.hasOwnProperty.call(UNITS, unit)) return null;
  return Number(m[1].replace(',', '.')) * UNITS[unit];
}

/** One required duration header, refused three ways: absent, empty, or not number-plus-unit. */
function requiredDuration(text, label, hint) {
  const raw = header(text, label);
  if (raw === null || raw === '') {
    cannotCheck('в контракте нет строки `**' + label + ':**` (или она пуста)', hint);
  }
  const value = seconds(raw);
  if (value === null || !Number.isFinite(value) || value <= 0) {
    cannotCheck('`' + label + '` не разбирается как длительность: ' + raw,
      'нужны число И единица, например `15 мин` или `60 с`; распознаются: '
      + [...new Set(Object.keys(UNITS))].join(' | ')
      + ' — голое число это две разные длительности, записанные одинаково');
  }
  return { seconds: value, raw };
}

/** Compare two user-visible descriptions the way a USER would: case and spacing do not separate
 *  two states, and neither does trailing punctuation. */
function normalize(s) {
  return String(s || '').toLowerCase().replace(/[\s.,;:!?«»"'`()]+/g, ' ').trim();
}

/**
 * The state table, as the contract records it.
 *
 * A row is a markdown table row whose FIRST cell is one of the three state names. The template ships
 * an example row, so a cell that is still a bracketed placeholder is a TEMPLATE cell and is read as
 * EMPTY — never as a filled-in one.
 */
function stateRows(text) {
  const cell = (v) => (/^\[.*\]$/.test(v) ? '' : v);
  const rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    const name = (cells[1] || '').toLowerCase();
    if (!STATES.includes(name)) continue;
    rows.push({
      name,
      status: (cells[2] || '').toUpperCase().replace(/\s+/g, ' ').trim(),
      seen: cell(cells[3] || ''),
      evidence: cell(cells[4] || ''),
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
        'это значит, что вопрос о долгих задачах НЕ ЗАДАВАЛСЯ — а НЕ что их нет; '
        + 'продукт без долгой работы отвечает `**Долгие задачи:** нет`, и это законный ответ');
    }
    cannotCheck('не читается ' + CONTRACT + ': ' + ((e && e.message) || e));
  }

  // 1. Is there long work at all? «нет» is legitimate and has nothing to check → 2.
  const long = closedHeader(text, 'Долгие задачи', LONG,
    'без этой строки «долгих задач нет» неотличимо от «про долгие задачи забыли»');
  if (!long) {
    cannotCheck('контракт говорит «Долгие задачи: нет» — вся работа укладывается в один ответ',
      'это законный ответ, а не нарушение; проверять нечего, поэтому не 0 и не 1');
  }

  // 2. Was the check performed? A named refusal is honest and exits 2.
  const run = closedHeader(text, 'Проверка выполнена', RUN_STATUS,
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
    cannotCheck('проверка НЕ ВЫПОЛНЕНА, причина: ' + picked[0],
      'честное «неизвестно», а не «клиент переживает разрыв»; до закрытия причины ни одно из '
      + 'трёх состояний не проверено');
  }

  // 3. The handle. Everything below refers to it, so a missing NAME is a 2.
  const idRaw = header(text, 'Идентификатор задачи');
  if (idRaw === null || idRaw === '') {
    cannotCheck('в контракте нет строки `**Идентификатор задачи:**` (или она пуста)',
      'назовите ПОЛЕ, по которому клиент второй раз находит свою задачу — без него после разрыва '
      + 'спросить не о чем');
  }
  const id = idRaw.replace(/^[`"']|[`"']$/g, '').trim();
  if (!/^[A-Za-z_][\w.-]*$/.test(id)) {
    cannotCheck('`Идентификатор задачи` это не имя поля: ' + idRaw,
      'нужно ИМЯ ПОЛЯ, например `job_id` или `taskId`, а не описание — по описанию нельзя '
      + 'проверить, что след проверки говорит о ТОЙ ЖЕ задаче');
  }

  // 4. Two durations. The bounded exception below is a comparison, so an unparseable value is a 2.
  const ceiling = requiredDuration(text, 'Предельное время задачи',
    'сколько задача работает в худшем случае — без этого нельзя сказать, помещается ли она в окно');
  const window = requiredDuration(text, 'Таймаут посредника',
    'САМЫЙ КОРОТКИЙ таймаут на пути к клиенту: обратный прокси, балансировщик, CDN или браузер');

  // 5. THE LOAD-BEARING COMPARISON. Silence is not a state; declaring it one erases the third state.
  const silence = closedHeader(text, 'Молчание', SILENCE,
    'как читается ОТСУТСТВИЕ ответа: как «неизвестно» или как «выполняется»');
  if (silence === 'running') {
    proven('молчание объявлено состоянием «выполняется» — а это НЕ состояние',
      ['**Молчание:** выполняется'],
      'живая задача, умерший исполнитель и оборванный посредник молчат ОДИНАКОВО: их различает '
      + 'только ЧТЕНИЕ состояния по идентификатору `' + id + '`. Пока молчание читается как '
      + '«выполняется», умершая задача ждёт вечно, повтор удваивает счёт, а пользователю нечего '
      + 'показать. Правильный ответ — «неизвестно», и опрос состояния.');
  }

  // 6. The handle must outlive the response that gets cut.
  const issued = closedHeader(text, 'Выдаётся', ISSUED,
    'КОГДА клиент получает идентификатор: до начала работы или вместе с результатом');
  if (issued === 'after') {
    proven('идентификатор выдаётся только вместе с результатом',
      ['**Выдаётся:** после завершения'],
      'разрыв уносит ответ, а вместе с ответом — и единственную ручку к уже выполненной работе: '
      + 'спросить «что с моей задачей» больше нечем, и деньги за внешние вызовы уже потрачены. '
      + 'Идентификатор обязан быть выдан ДО начала работы.');
  }

  // 7. A repeat that restarts is failure class 2, and it is declarable.
  const resume = closedHeader(text, 'Продолжение при повторе', RESUME,
    'чем обеспечено, что повтор ПРОДОЛЖАЕТ, а не начинает заново');
  if (resume === 'none') {
    proven('повтор начинает работу заново',
      ['**Продолжение при повторе:** нет'],
      'каждая повторная попытка — это второй счёт за те же внешние вызовы, и пользователь нажимает '
      + 'её именно тогда, когда первая молчит. Назовите механизм: '
      + Object.keys(RESUME).filter((k) => k !== 'НЕТ').join(' | ').toLowerCase()
      + '. Родня с повторной доставкой ВХОДЯЩИХ вебхуков — соседнее правило, отдельный механизм: '
      + 'там повтор приходит извне, здесь его порождает ваш же клиент.');
  }

  // 8. The synchronous answer, BOUNDED: legal only when the work provably fits inside the window.
  const create = closedHeader(text, 'Ответ на создание', CREATE,
    'что возвращает вызов создания: идентификатор или готовый результат');
  const fits = ceiling.seconds < window.seconds;
  if (create === 'result' && !fits) {
    proven('ответом на создание объявлен РЕЗУЛЬТАТ, а работа не помещается в окно посредника',
      ['предельное время задачи: ' + ceiling.raw + ' (' + ceiling.seconds + ' с)',
        'таймаут посредника:      ' + window.raw + ' (' + window.seconds + ' с)'],
      'это обычный запрос-ответ под другим названием: посредник оборвёт соединение раньше, чем '
      + 'работа закончится, и результат будет потерян ПОСЛЕ того, как за него заплатили. '
      + 'Возвращайте идентификатор сразу, результат — отдельным чтением.');
  }

  // 9. The handle must have a place to live, and that place must be about THIS field.
  const lives = header(text, 'Где живёт');
  if (lives === null || lives === '') {
    cannotCheck('в контракте нет строки `**Где живёт:**` (или она пуста)',
      'где идентификатор ВЫДАЁТСЯ и где он ЧИТАЕТСЯ — назвать поле и не назвать место значит '
      + 'не дать клиенту способа им воспользоваться');
  }
  if (!lives.toLowerCase().includes(id.toLowerCase())) {
    proven('строка `Где живёт` не упоминает названное поле',
      ['идентификатор: ' + id, 'где живёт:     ' + lives],
      'поле названо в одном месте контракта, а место его жизни описывает что-то другое — значит '
      + 'по контракту нельзя сказать, откуда клиент возьмёт ручку и куда её вернёт.');
  }

  // 10. All three states, each answered, each proof naming the identifier, each DIFFERENT to the user.
  const rows = stateRows(text);
  const seen = rows.map((r) => r.name);
  const dupes = [...new Set(seen.filter((n, i) => seen.indexOf(n) !== i))];
  if (dupes.length) {
    cannotCheck('в таблице состояний повторяются строки: ' + dupes.join(', '),
      'одно состояние — одна строка; иначе один зачёт закрывает сразу два разных вопроса');
  }
  const bad = rows.filter((r) => !Object.prototype.hasOwnProperty.call(STATE_STATUS, r.status));
  if (bad.length) {
    cannotCheck('нераспознанный статус состояния: '
      + bad.map((r) => r.name + ' → ' + (r.status || '(пусто)')).join(', '),
      'допустимы ровно: ' + Object.keys(STATE_STATUS).join(' | '));
  }

  const missing = STATES.filter((s) => !seen.includes(s));
  if (missing.length) {
    proven('состояние не названо вовсе (' + missing.length + ' из ' + STATES.length + ')',
      missing,
      'три состояния это ЗАКРЫТЫЙ и ОБЯЗАТЕЛЬНЫЙ набор. Два («идёт» и «готово») — это и есть '
      + 'дефект: отказу негде появиться, и он выдаётся пользователю как вечный прогресс.');
  }

  const unchecked = rows.filter((r) => STATE_STATUS[r.status] === 'unchecked');
  if (unchecked.length) {
    proven('проверка объявлена ВЫПОЛНЕННОЙ, но состояние осталось НЕ ПРОВЕРЕНО',
      unchecked.map((r) => r.name),
      'либо проверьте состояние, либо объявите всю проверку НЕ ВЫПОЛНЕННОЙ с причиной — '
      + 'частичный прогон под вывеской выполненного и есть ложная квитанция.');
  }

  const blind = rows.filter((r) => normalize(r.seen) === '');
  if (blind.length) {
    proven('состояние без наблюдаемого признака — для пользователя его не существует',
      blind.map((r) => r.name),
      'колонка «что видит пользователь» и есть разница между тремя состояниями; пустая, она '
      + 'оставляет пользователя перед той же тишиной, ради которой всё это и заведено.');
  }

  const collisions = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      if (normalize(rows[i].seen) === normalize(rows[j].seen)) {
        collisions.push(rows[i].name + ' и ' + rows[j].name + ': «' + rows[i].seen + '»');
      }
    }
  }
  if (collisions.length) {
    proven('два состояния выглядят для пользователя ОДИНАКОВО — значит это одно состояние',
      collisions,
      'различимость — это и есть требование: пользователь, который не отличает отказ от работы, '
      + 'нажимает кнопку ещё раз и порождает третью копию.');
  }

  const noProof = [];
  const noId = [];
  for (const row of rows) {
    if (!row.evidence.trim()) { noProof.push(row.name); continue; }
    if (!row.evidence.toLowerCase().includes(id.toLowerCase())) noId.push(row.name);
  }
  if (noProof.length) {
    proven('состояние объявлено ПРОВЕРЕННЫМ без всякого доказательства', noProof,
      'пустая клетка и незаполненный шаблон читаются одинаково: как отсутствие следа.');
  }
  if (noId.length) {
    proven('доказательство состояния не называет идентификатор `' + id + '`', noId,
      'след без идентификатора не отличает «я прочитал состояние СВОЕЙ задачи» от «сервер вообще '
      + 'ответил»: ровно та же подмена, что подтверждение развёртывания обращением к localhost.');
  }

  say('✅ все ' + STATES.length + ' состояния различимы и проверены по идентификатору `' + id + '`');
  say('   ручка: выдаётся ДО начала работы · повтор продолжает: '
    + (header(text, 'Продолжение при повторе') || resume)
    + ' · потолок ' + ceiling.raw + ' против окна ' + window.raw);
  if (create === 'result' && fits) {
    say('   Ограниченное исключение: ответ синхронный, но заявленный потолок КОРОЧЕ окна посредника '
      + '(' + ceiling.seconds + ' с < ' + window.seconds + ' с). Занижённый потолок — ложь в самой '
      + 'декларации, и оба числа напечатаны здесь именно поэтому.');
  }
  say('   Ограничение: это доказывает, что ДЕКЛАРАЦИЯ непротиворечива и что следы названы по '
    + 'идентификатору — а НЕ что сервер переживает настоящий разрыв. Это доказывает только прогон '
    + 'с оборванным соединением и повтором.');
  process.exit(0);
}

try {
  main();
} catch (err) {
  // Even an unexpected failure must not read as "clean".
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err));
}
