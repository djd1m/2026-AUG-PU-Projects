#!/usr/bin/env node
'use strict';

/**
 * check-model-cost.cjs — у каждого внешнего вызова модели назван ПРЕДЕЛ, и он способен связать?
 *
 * NOT an event hook. Like `check-ports.cjs`, `check-look-trace.cjs`, `check-growth-trace.cjs`,
 * `check-docs-complete.cjs`, `check-swarm-receipts.cjs` and `check-embed-contract.cjs`, it lives here
 * because this directory already carries plain Node utilities; nothing registers it in
 * settings.json. That is deliberate: this package's hooks are NON-BLOCKING by contract (pinned by
 * tests/unit/hooks-project-anchored.test.js, which requires exit 0), so a hook could never refuse
 * anything — it could only print. Invoke it:
 *
 *   node .claude/hooks/check-model-cost.cjs [path-to-project]
 *
 * WHY IT EXISTS — the failure, before the technology.
 *
 * An external model call costs money PER CALL, and in the products this pipeline builds the call is
 * triggered by a STRANGER, not by the developer: a Cal AI clone runs a multimodal model on every
 * photo ANY visitor uploads; a podcast tool runs Whisper on every episode ANY user submits; a
 * knowledge-base tool embeds the WHOLE base a client pastes in. The meter is turned by someone whose
 * behaviour you do not control and whose good faith you cannot assume.
 *
 * THE PROPERTY THAT MAKES THIS CLASS DIFFERENT FROM EVERY OTHER DEFECT IN THIS PACKAGE: the failure
 * CANNOT BE ROLLED BACK. A wrong port is closed and the story ends; a wrong widget origin is
 * re-tested and the story ends. Here one unclosed loop or one hostile visitor produces an INVOICE —
 * the money left, and no edit to the code brings it back. Everything below is shaped by that: the
 * question is never "will we notice?", it is "what refused BEFORE the call was made?".
 *
 * TWO SOURCES OF SPEND, and they fail differently — this is the reason for the `Кто запускает`
 * column and not a stylistic distinction:
 *
 *   свой-код     you ruin YOURSELF: a loop, a retry, a backfill over the whole table. Bounded by
 *                your own code, so a per-day ceiling is a sufficient bound.
 *   посторонний  you are ruined BY SOMEONE ELSE: the visitor decides how many times the meter turns.
 *                A per-day ceiling alone is NOT sufficient — one visitor can eat the whole day's
 *                budget before lunch — so the per-USER ceiling must be able to BIND, which requires
 *                naming what counts as one user for someone who never logged in.
 *
 * THE CONTRADICTION THIS FILE EXISTS TO CATCH: `Вход: без-входа` together with
 * `Единица счёта: аккаунт`. A per-account limit for a caller who has no account is a limit that can
 * never bind — it is written like a defence and behaves like none. That is the same shape as the
 * widget checked on its own origin: a measurement that cannot observe the failure it names.
 *
 * WHY «не число» IS EXIT 1 AND NOT EXIT 2. Everywhere else in this package an unparseable value is
 * "the check did not run". Here it is a PROVEN defect, deliberately: `Предел на пользователя:
 * разумный` is not a malformed field, it is EXACTLY the defect the rule names — an intention
 * standing where a number must stand. Nobody can enforce «разумный» at runtime, so the ceiling does
 * not exist. Reading that as "could not check" would file the defect as an unknown.
 *
 * WHAT THIS FILE CAN AND CANNOT DECIDE — read before trusting exit 0.
 *
 * It reads a DECLARATION, `docs/model-cost-contract.md`, and decides only what a declaration can
 * settle: that every call is enumerated, that each ceiling is a POSITIVE INTEGER rather than an
 * intention, that a per-user ceiling is reachable (≤ the daily one) and attachable (a counting unit
 * that exists for that caller), that reaching a ceiling REFUSES rather than degrades, that an
 * unconfigured ceiling refuses at boot rather than meaning infinity, and that the spend has an
 * ADDRESS somebody can open. It does NOT execute your code, does NOT count a single call and does
 * NOT read anyone's invoice — see «Слой 3–4» in `.claude/rules/model-call-cost.md`, which says in
 * the same words why no deterministic half of that can exist here.
 *
 * THE EXACT FORM OF `docs/model-cost-contract.md` — the rule delegates it here on purpose: this file
 * is not part of the always-loaded corpus, so the long form costs nothing per run, while the rule
 * keeps only the decision the reader must carry.
 *
 *   **Внешние вызовы модели:** да        (да | нет — `нет` is a legitimate answer)
 *   **Где виден расход:** https://console.example.com/usage   (an address, not a genre of place)
 *   **Счёт ведётся по:** попыткам        (попыткам | успехам)
 *   **Потолок не сконфигурирован:** ОТКАЗ ПРИ СТАРТЕ   (ОТКАЗ ПРИ СТАРТЕ | БЕЗ ОГРАНИЧЕНИЙ)
 *   **Проверка пределов:** ВЫПОЛНЕНА     (ВЫПОЛНЕНА | НЕ ВЫПОЛНЕНА)
 *   **Причина:** —        (required when НЕ ВЫПОЛНЕНА; one of the closed REASONS below)
 *
 *   ## Внешние вызовы
 *
 *   | Вызов | Кто запускает | Вход | Единица счёта | Предел на пользователя | Предел в сутки | При достижении |
 *   |---|---|---|---|---|---|---|
 *   | распознавание-фото | посторонний | без-входа | сессия | 20 | 2000 | ОТКАЗ |
 *   | ночной-пересчёт | свой-код | — | — | 500 | 500 | ОТКАЗ |
 *
 * Exit codes — three, and the third is the point:
 *   0  every call is enumerated and every ceiling is a number that can actually bind
 *   1  a defect is PROVEN and named: a ceiling that is an intention, a non-positive or unlimited
 *      ceiling, a per-user ceiling above the daily one, an outsider-triggered call with no counting
 *      unit or with one that cannot exist for it, silent degradation instead of refusal, an
 *      unconfigured ceiling declared as «без ограничений», billing counted by successes, a spend
 *      place with no address, or an empty call table under «Внешние вызовы модели: да»
 *   2  THE CHECK DID NOT RUN — no contract, an unrecognised value, duplicate rows, or the legitimate
 *      answers «внешних вызовов модели нет» / «проверка НЕ ВЫПОЛНЕНА, причина такая-то»
 *
 * A checker that answers "clean" when it could not look converts an unknown into a reassurance —
 * and for THIS feature the reassurance is paid for with money that does not come back.
 */

const fs = require('node:fs');
const path = require('node:path');

const CONTRACT = path.join('docs', 'model-cost-contract.md');

/** Does the product call an external model at all? A CLOSED set — `нет` is a legitimate answer and
 *  it exits 2, never 0: there is nothing to bound, and «нечего ограничивать» must not be spelled the
 *  same way as «ограничено». */
const CALLS_MODEL = { 'ДА': true, 'НЕТ': false };

/** Was the limit review performed? CLOSED, and the negative answer is honest, not a failure:
 *  CFG-I4 of `honest-configuration` — an unreachable truth yields UNKNOWN, never a plausible value. */
const RUN_STATUS = { 'ВЫПОЛНЕНА': 'done', 'НЕ ВЫПОЛНЕНА': 'not-done' };

/**
 * Why the limits were not settled. CLOSED list — free text is not a reason here, because the entire
 * value of the list is that each entry names a DIFFERENT repair:
 *   не-подключено       — wire the provider, then re-check
 *   нет-доступа-к-счёту — get access to the billing console, then name the place
 *   решение-отложено    — take the decision (this is the one that quietly becomes an invoice)
 *   вне-объёма          — decide it is out of scope and record the decision
 */
const REASONS = ['не-подключено', 'нет-доступа-к-счёту', 'решение-отложено', 'вне-объёма'];

/**
 * What the code does when the ceiling is NOT configured. CLOSED, and the whole extension of
 * `honest-configuration` to money lives in this one field: an absent limit is a REFUSAL, never
 * «ограничений нет». CFG-S1 — an absent required value refuses and names the external consequence;
 * here the external consequence is an invoice.
 */
const UNSET_CEILING = { 'ОТКАЗ ПРИ СТАРТЕ': 'refuse', 'БЕЗ ОГРАНИЧЕНИЙ': 'unlimited' };

/** Are attempts billed, or only successes? CLOSED. A failed attempt is billed by the provider all
 *  the same, so counting successes leaves the retry path unmetered. */
const BILLED_ON = { 'ПОПЫТКАМ': 'attempts', 'УСПЕХАМ': 'successes' };

/** Who turns the meter. CLOSED — the two halves fail differently and need different ceilings. */
const TRIGGER = { 'свой-код': 'own', 'посторонний': 'outsider' };

/** Can the trigger be reached without logging in? CLOSED. `—` is «not applicable», legitimate only
 *  for `свой-код`; for an outsider it is an unanswered question, and it is the question. */
const AUTH = { 'без-входа': 'anonymous', 'после-входа': 'authenticated', '—': 'n/a' };

/** What counts as ONE user. CLOSED — `аккаунт` does not exist for an anonymous caller, and that
 *  impossibility is the defect this file is built around. */
const UNIT = { 'аккаунт': 'account', 'сессия': 'session', 'адрес': 'address', 'ключ': 'key', '—': 'none' };

/** What happens at the ceiling. CLOSED, and only the first passes: a ceiling that degrades quietly
 *  is not a ceiling, and a queue postpones the call without cancelling the spend. */
const ON_LIMIT = { 'ОТКАЗ': 'refuse', 'ДЕГРАДАЦИЯ': 'degrade', 'ОЧЕРЕДЬ': 'queue' };

/** Spellings that mean "no ceiling". Named separately from "not a number" so the printed repair is
 *  the right one: an infinity was CHOSEN, a typo was not. */
const UNLIMITED = /^(∞|inf|infinity|unlimited|без\s*ограничений|неограничен\w*|-\s*1|нет)$/i;

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
function header(text, label, { strip = true } = {}) {
  const re = new RegExp('^\\s*\\*\\*' + label + ':?\\*\\*\\s*:?(.*)$', 'im');
  const m = re.exec(text);
  if (!m) return null;
  const value = m[1].trim();
  // `strip: false` is not a stylistic choice: the ONLY value in this contract whose backticks CARRY
  // MEANING is the spend address (a runnable command is one of the three things a person can open),
  // and stripping them would turn `make spend-report` into prose the address test then refuses.
  return strip ? value.replace(/^[«"`]|[»"`]$/g, '').trim() : value;
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
 * A ceiling, read as three DIFFERENT answers rather than one boolean.
 *
 *   {kind:'number'}     a positive integer — the only value anything can enforce
 *   {kind:'unlimited'}  an infinity was chosen and written down
 *   {kind:'intent'}     prose, a placeholder, or an empty cell standing where a number must stand
 *   {kind:'zero'}       0 or a negative count
 *
 * Thousand separators (space, thin space, underscore) are stripped: `2 000` is a number a person
 * writes and a machine can still read, and refusing it would push people to omit the separator
 * rather than to name the ceiling.
 */
function ceiling(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '' || /^\[.*\]$/.test(s) || s === '—' || s === '-') return { kind: 'intent', raw: s };
  if (UNLIMITED.test(s)) return { kind: 'unlimited', raw: s };
  const compact = s.replace(/[\s  _]/g, '');
  if (!/^\d+$/.test(compact)) return { kind: 'intent', raw: s };
  const value = Number(compact);
  if (!Number.isSafeInteger(value)) return { kind: 'intent', raw: s };
  if (value <= 0) return { kind: 'zero', raw: s, value };
  return { kind: 'number', raw: s, value };
}

/**
 * Does the spend have an ADDRESS, or only a genre of place?
 *
 * The kinship with the widget contract's evidence cell: without an address, «расход виден» and
 * «расход не виден» are written identically. A URL, or a path with a separator, or a runnable
 * command — all three are things a person can OPEN. «в логах», «в консоли провайдера», «у меня в
 * голове» are not.
 */
function hasAddress(raw) {
  const s = String(raw || '');
  if (/\b[a-z][a-z0-9+.-]*:\/\/\S+/i.test(s)) return true;      // https://…
  if (/(^|\s)[.~]?\/[\w.@-]+(\/[\w.@-]*)*/.test(s)) return true; // /var/log/spend.jsonl, ./usage
  if (/`[^`]+`/.test(s)) return true;                            // `make spend-report`
  return false;
}

/**
 * The call table, as the contract records it.
 *
 * A row is a markdown table row whose SECOND cell is one of the two triggers — the header row and
 * the `|---|` separator therefore cannot be mistaken for data, and a row whose trigger is misspelled
 * is reported rather than silently dropped.
 */
function callRows(text) {
  const rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 9) continue;                 // '' + 7 columns + ''
    const name = cells[1];
    if (!name || /^-+$/.test(name) || name.toLowerCase() === 'вызов') continue;
    rows.push({
      name,
      trigger: cells[2].toLowerCase(),
      auth: cells[3].toLowerCase(),
      unit: cells[4].toLowerCase(),
      perUser: cells[5],
      perDay: cells[6],
      onLimit: cells[7].toUpperCase().replace(/\s+/g, ' ').trim(),
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
        'это значит, что вопрос о стоимости НЕ ЗАДАВАЛСЯ — а НЕ что вызовов нет; продукт без '
        + 'внешних вызовов модели отвечает `**Внешние вызовы модели:** нет`, и это законный ответ');
    }
    cannotCheck('не читается ' + CONTRACT + ': ' + ((e && e.message) || e));
  }

  // 1. Does the product call a model at all? «нет» is legitimate and has nothing to bound → 2.
  const calls = closedHeader(text, 'Внешние вызовы модели', CALLS_MODEL,
    'без этой строки «вызовов нет» неотличимо от «про вызовы забыли»');
  if (!calls) {
    cannotCheck('контракт говорит «Внешние вызовы модели: нет» — платного вызова наружу нет',
      'это законный ответ, а не нарушение; ограничивать нечего, поэтому не 0 и не 1');
  }

  // 2. Was the limit review performed? A named refusal is honest and exits 2.
  const run = closedHeader(text, 'Проверка пределов', RUN_STATUS,
    'без этой строки «не считали» неотличимо от «посчитали»');
  if (run === 'not-done') {
    const raw = header(text, 'Причина');
    if (raw === null || raw === '') {
      cannotCheck('проверка пределов НЕ ВЫПОЛНЕНА без строки `**Причина:**`',
        'причина обязательна и берётся из закрытого списка: ' + REASONS.join(' | ')
        + ' — каждая означает СВОЙ ремонт');
    }
    const picked = REASONS.filter((r) => raw.includes(r));
    if (picked.length !== 1) {
      cannotCheck('причина «' + raw + '» не из закрытого списка (или названо сразу несколько)',
        'допустимы ровно: ' + REASONS.join(' | '));
    }
    cannotCheck('проверка пределов НЕ ВЫПОЛНЕНА, причина: ' + picked[0],
      'честное «неизвестно», а не «расход ограничен»; пока причина не закрыта, счёт ничем '
      + 'не ограничен, и потраченного не вернуть');
  }

  // 3. ПРАВИЛО №0. An unconfigured ceiling is a REFUSAL, never infinity — the whole extension of
  //    honest-configuration to money, and the cheapest deterministic bite in this file.
  const unset = closedHeader(text, 'Потолок не сконфигурирован', UNSET_CEILING,
    'что делает код, когда предел не задан');
  if (unset === 'unlimited') {
    proven('несконфигурированный потолок объявлен как «без ограничений»',
      ['**Потолок не сконфигурирован:** БЕЗ ОГРАНИЧЕНИЙ'],
      'отсутствующий предел — это ОТКАЗ, а не отсутствие предела (`honest-configuration`, CFG-S1): '
      + 'пустая переменная окружения не должна значить бесконечность. Запуск обязан ПАДАТЬ, называя '
      + 'ненастроенный вызов, — потому что второй шанс здесь оплачивается счётом.');
  }

  // 4. Attempts, not successes: a failed call is billed by the provider all the same.
  const billed = closedHeader(text, 'Счёт ведётся по', BILLED_ON,
    'считаются попытки или только успешные вызовы');
  if (billed === 'successes') {
    proven('счёт ведётся по УСПЕХАМ — неудачные вызовы не попадают под предел',
      ['**Счёт ведётся по:** успехам'],
      'провайдер выставляет счёт за ПОПЫТКУ: таймаут, отказ модели и повтор оплачены так же, как '
      + 'успех. Счётчик по успехам оставляет путь повторов вне предела — а повтор долгой фоновой '
      + 'задачи удваивает счёт (см. правило этого пакета о долгих фоновых задачах).');
  }

  // 5. Where the spend is visible. A ceiling nobody can observe is learned about from the invoice.
  const where = header(text, 'Где виден расход', { strip: false });
  if (where === null || where === '') {
    cannotCheck('в контракте нет строки `**Где виден расход:**` (или она пуста)',
      'адрес панели, файла или команды — предел, о котором нельзя узнать до счёта, не предел');
  }
  if (!hasAddress(where)) {
    proven('место расхода названо жанром, а не адресом', ['«' + where + '»'],
      'нужен адрес, который можно ОТКРЫТЬ: `https://…`, путь вида `/var/log/model-spend.jsonl` '
      + 'или команда в обратных кавычках. Без адреса «расход виден» и «расход не виден» пишутся '
      + 'одинаково — ровно тот же дефект, что доказательство проверки без адреса.');
  }

  // 6. The calls themselves.
  const rows = callRows(text);
  if (rows.length === 0) {
    proven('объявлены внешние вызовы модели, но ни один не назван', ['таблица `## Внешние вызовы` пуста'],
      'нельзя назвать предел вызову, которого нет в списке. Пустая таблица под «да» — доказанный '
      + 'пропуск, а не неизвестность.');
  }
  const names = rows.map((r) => r.name.toLowerCase());
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  if (dupes.length) {
    cannotCheck('в таблице вызовов повторяются строки: ' + dupes.join(', '),
      'один вызов — одна строка; иначе один предел закрывает сразу два разных счётчика');
  }

  for (const [field, map, label] of [['trigger', TRIGGER, 'Кто запускает'], ['auth', AUTH, 'Вход'],
    ['unit', UNIT, 'Единица счёта'], ['onLimit', ON_LIMIT, 'При достижении']]) {
    const bad = rows.filter((r) => !Object.prototype.hasOwnProperty.call(map, r[field]));
    if (bad.length) {
      cannotCheck('нераспознанное значение `' + label + '`: '
        + bad.map((r) => r.name + ' → ' + (r[field] || '(пусто)')).join(', '),
        'допустимы ровно: ' + Object.keys(map).join(' | '));
    }
  }

  // 6a. Reaching the ceiling must REFUSE. Degradation and a queue are named apart because they are
  //     different mistakes: one hides the ceiling, the other postpones the spend without cancelling it.
  const degrading = rows.filter((r) => ON_LIMIT[r.onLimit] === 'degrade');
  if (degrading.length) {
    proven('при достижении предела объявлена ДЕГРАДАЦИЯ, а не отказ', degrading.map((r) => r.name),
      'тихая деградация — это предел, о котором пользователь не узнал, а вы узнаете из счёта: '
      + 'система продолжает звать модель «поменьше» и продолжает платить. Достижение предела '
      + 'обязано быть ОТКАЗОМ, названным вслух.');
  }
  const queued = rows.filter((r) => ON_LIMIT[r.onLimit] === 'queue');
  if (queued.length) {
    proven('при достижении предела объявлена ОЧЕРЕДЬ, а не отказ', queued.map((r) => r.name),
      'очередь ОТКЛАДЫВАЕТ вызов, но не отменяет расход: когда очередь разойдётся, счёт будет тот '
      + 'же. Предел, который переносит трату на завтра, не ограничивает трату.');
  }

  // 6b. Every ceiling must be a NUMBER — the requirement the rule states in its first line.
  const intents = [];
  const infinities = [];
  const zeros = [];
  for (const row of rows) {
    for (const [field, label] of [['perUser', 'на пользователя'], ['perDay', 'в сутки']]) {
      const c = ceiling(row[field]);
      row[field + 'C'] = c;
      if (c.kind === 'intent') intents.push(row.name + ' / ' + label + ': «' + (c.raw || '(пусто)') + '»');
      if (c.kind === 'unlimited') infinities.push(row.name + ' / ' + label + ': «' + c.raw + '»');
      if (c.kind === 'zero') zeros.push(row.name + ' / ' + label + ': ' + c.raw);
    }
  }
  if (intents.length) {
    proven('предел назван намерением, а не числом', intents,
      'ни один код не умеет применить «разумный», «по ситуации» или пустую клетку: такого предела '
      + 'нет. Число — единственная форма, которую можно сравнить со счётчиком.');
  }
  if (infinities.length) {
    proven('предел объявлен бесконечным', infinities,
      'бесконечный предел — это отсутствие предела, записанное так, будто предел есть. Если '
      + 'ограничивать действительно не нужно, это решение, и его место — `**Причина:** вне-объёма` '
      + 'при НЕ ВЫПОЛНЕННОЙ проверке, а не число ∞ в графе предела.');
  }
  if (zeros.length) {
    proven('предел не положителен', zeros,
      'ноль или отрицательное значение чаще всего означает «поле не заполнили», а ведёт себя как '
      + '«вызов запрещён навсегда». Если вызов действительно выключен — уберите строку.');
  }

  // 6c. A per-user ceiling ABOVE the daily one can never bind: the daily one always fires first.
  const dead = rows.filter((r) => r.perUserC.value > r.perDayC.value);
  if (dead.length) {
    proven('предел на пользователя выше суточного — он не сработает никогда',
      dead.map((r) => r.name + ': на пользователя ' + r.perUserC.value + ' > в сутки ' + r.perDayC.value),
      'суточный предел упрётся первым, поэтому персональный написан, но не действует: один '
      + 'посетитель по-прежнему может съесть весь дневной бюджет. Предел на пользователя обязан '
      + 'быть НЕ БОЛЬШЕ суточного, иначе он декоративен.');
  }

  // 6d. THE LOAD-BEARING CHECK. For an outsider-triggered call the per-user ceiling must be able to
  //     BIND, and that is decided by the counting unit — the one thing an anonymous caller may lack.
  const outsiders = rows.filter((r) => TRIGGER[r.trigger] === 'outsider');
  const unanswered = outsiders.filter((r) => AUTH[r.auth] === 'n/a');
  if (unanswered.length) {
    proven('вызов запускает ПОСТОРОННИЙ, но не сказано, нужен ли ему вход', unanswered.map((r) => r.name),
      'именно вход отделяет «нас разоряет свой цикл» от «нас разоряет любой прохожий»: без входа '
      + 'счётчик посетителей ничем не ограничен сверху. `—` в этой графе законен только для '
      + '`свой-код`.');
  }
  const unattached = outsiders.filter((r) => UNIT[r.unit] === 'none');
  if (unattached.length) {
    proven('вызов запускает ПОСТОРОННИЙ, но предел на пользователя не к чему привязать',
      unattached.map((r) => r.name),
      'чтобы считать «на одного», надо назвать, что такое один: аккаунт, сессия, адрес или ключ. '
      + 'Без единицы счёта суточный предел остаётся единственным, и один посетитель законно '
      + 'выбирает его целиком.');
  }
  const impossible = outsiders.filter((r) => AUTH[r.auth] === 'anonymous' && UNIT[r.unit] === 'account');
  if (impossible.length) {
    proven('единица счёта не существует для того, кто вызов запускает',
      impossible.map((r) => r.name + ': вход `без-входа`, счёт `аккаунт`'),
      'у анонимного посетителя нет аккаунта, поэтому предел «на аккаунт» не может связать НИ ОДИН '
      + 'его вызов: он написан как защита и ведёт себя как её отсутствие. Считайте по сессии, '
      + 'адресу или ключу — либо потребуйте вход и тогда считайте по аккаунту.');
  }

  const anon = outsiders.filter((r) => AUTH[r.auth] === 'anonymous').length;
  say('✅ ' + rows.length + ' вызов(ов) названы, у каждого предел на пользователя и в сутки — числа, '
    + 'достижение предела отказывает');
  say('   Из них запускаются посторонними: ' + outsiders.length + ' (из них без входа: ' + anon + ')');
  say('   Ограничение: это доказывает, что предел ОБЪЯВЛЕН и способен связать — а не что код его '
    + 'применяет. Применение доказывает только прогон, упершийся в предел, и счёт после него.');
  process.exit(0);
}

try {
  main();
} catch (err) {
  // Even an unexpected failure must not read as "clean".
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err));
}
