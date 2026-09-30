#!/usr/bin/env node
'use strict';

/**
 * check-webhook-contract.cjs — событие пришло дважды и пришло ОТ КОГО УГОДНО. Что решено?
 *
 * NOT an event hook. Like `check-ports.cjs`, `check-look-trace.cjs`, `check-growth-trace.cjs`,
 * `check-docs-complete.cjs`, `check-swarm-receipts.cjs` and `check-embed-contract.cjs`, it lives here
 * because this directory already carries plain Node utilities; nothing registers it in settings.json.
 * That is deliberate: this package's hooks are NON-BLOCKING by contract (pinned by
 * tests/unit/hooks-project-anchored.test.js, which requires exit 0), so a hook could never refuse
 * anything — it could only print. Invoke it:
 *
 *   node .claude/hooks/check-webhook-contract.cjs [path-to-project]
 *
 * WHY IT EXISTS — the failure, before the technology.
 *
 * A webhook is an INCOMING call from someone else's system, most often a payment provider. Two facts
 * about that caller decide everything below, and neither is a matter of taste:
 *
 *   1. IT DELIVERS THE SAME EVENT MORE THAN ONCE, BY CONSTRUCTION. Providers promise at-least-once,
 *      never exactly-once: a timeout, a 500, a network blip on the ACK — and the event is sent again.
 *      A handler with no repeat key credits the partner's commission twice, and NOBODY NOTICES,
 *      because each of the two credits is a perfectly legitimate row on its own. There is no error
 *      log, no alert, no failing request: the failure has no symptom, only wrong money.
 *
 *   2. THE ADDRESS IS PUBLIC, SO ANYONE CAN POST TO IT. Without signature verification the endpoint
 *      accepts a "payment succeeded" event from any stranger who guessed the URL.
 *
 * The SAME retry topology produces a third failure that is usually left out, and leaving it out is
 * how a team ships a "fixed" handler that still loses money:
 *
 *   3. THE ORDER IS NOT GUARANTEED. Independent retries mean event B can be applied after event A
 *      that happened later. A handler that assigns state blindly (`subscription.status = ...`) has a
 *      retried old event overwrite the newer one — again silently, again for money. This checker
 *      therefore answers for ordering too; the rule `.claude/rules/incoming-webhooks.md` records why
 *      that is one obligation and not two documents.
 *
 * WHAT THIS FILE CAN AND CANNOT DECIDE — read before trusting exit 0.
 *
 * It reads a DECLARATION, `docs/webhook-contract.md`, and decides only what a declaration can settle:
 * that a repeat key is NAMED, that it comes from the sender's event rather than being invented on
 * receipt, that it is stored somewhere that survives a restart and is shared between workers, that
 * the exclusion is atomic rather than a check-then-insert race, that the signature is verified over
 * the RAW body BEFORE parsing with a constant-time comparison inside a bounded freshness window, that
 * ordering has an answer that is not the false belief "the sender guarantees it", and that each of
 * the three failure classes points at a test file THAT EXISTS.
 *
 * It does NOT run the project's tests, does NOT connect to its database, and does NOT read its source
 * in any of the languages a replicated product might be written in — this package has ZERO
 * dependencies. So it cannot know whether the named test really delivers ONE event TWICE and asserts
 * ONE credit, nor whether the unique index really exists in the deployed schema. That half is layer
 * 3/4 and the rule says so in the same words.
 *
 * THE EXACT FORM OF `docs/webhook-contract.md` — the rule delegates it here on purpose: this file is
 * not part of the always-loaded corpus, so the long form costs nothing per run, while the rule keeps
 * only the decision the reader must carry.
 *
 *   **Входящие вебхуки:** да                 (да | нет — `нет` is a legitimate answer)
 *   **Отправитель:** Stripe
 *   **Проверка повторной доставкой:** ВЫПОЛНЕНА   (ВЫПОЛНЕНА | НЕ ВЫПОЛНЕНА)
 *   **Причина:** —                           (required when НЕ ВЫПОЛНЕНА; one of REASONS below)
 *   **Ключ повторности:** event.id
 *   **Источник ключа:** событие-отправителя  (событие-отправителя | сгенерирован-получателем)
 *   **Хранилище ключа:** таблица webhook_events, колонка event_id
 *   **Механизм исключения:** уникальный-индекс   (уникальный-индекс | атомарная-вставка |
 *                                                 проверка-перед-вставкой)
 *   **Что подписано:** сырое-тело            (сырое-тело | разобранное-тело)
 *   **Когда проверяется подпись:** до-разбора    (до-разбора | после-разбора)
 *   **Сравнение подписи:** постоянное-время  (постоянное-время | обычное)
 *   **Окно свежести (секунды):** 300
 *   **Порядок событий:** версия-из-события   (версия-из-события | перестановочен |
 *                                             гарантирован-отправителем)
 *
 *   ## Классы отказа
 *
 *   | Класс | Статус | Признак | Лечение | Доказательство |
 *   |---|---|---|---|---|
 *   | подделка | ЗАКРЫТ | … | … | tests/webhooks/test_signature.py |
 *   | повтор | ЗАКРЫТ | … | … | tests/webhooks/test_redelivery.py |
 *   | перестановка | ЗАКРЫТ | … | … | tests/webhooks/test_ordering.py |
 *
 * Exit codes — three, and the third is the point:
 *   0  all three classes closed; the repeat key, its origin, its store and its exclusion are named
 *      and none of them is one of the forms that provably cannot work; the signature is checked over
 *      the raw body before parsing, constant-time, inside a bounded window; ordering is answered
 *   1  a defect is PROVEN and named
 *   2  THE CHECK DID NOT RUN — no contract, an unrecognised value, an unparseable number, or the
 *      legitimate answers «входящих вебхуков нет» / «проверка НЕ ВЫПОЛНЕНА, причина такая-то»
 *
 * A checker that answers "clean" when it could not look converts an unknown into a reassurance —
 * which for this feature is a partner paid twice out of your own margin.
 */

const fs = require('node:fs');
const path = require('node:path');

const CONTRACT = path.join('docs', 'webhook-contract.md');

/** Does anything call INTO this product at all? CLOSED — `нет` is legitimate and exits 2, never 0:
 *  there is nothing to check, and «нечего проверять» must not be spelled like «проверено». */
const INCOMING = { 'ДА': true, 'НЕТ': false };

/** Was one event actually delivered TWICE against the running handler? CLOSED, and the negative
 *  answer is honest, not a failure: CFG-I4 of `honest-configuration` — an unreachable truth yields
 *  UNKNOWN, never a plausible value. */
const RUN_STATUS = { 'ВЫПОЛНЕНА': 'done', 'НЕ ВЫПОЛНЕНА': 'not-done' };

/**
 * Why the redelivery run did not happen. CLOSED list — free text is not a reason here, because the
 * entire value of the list is that each entry names a DIFFERENT repair:
 *   no-provider      — connect the sender's test mode   · no-test-harness — build the replay fixture
 *   not-implemented  — write the handler, then re-check · out-of-scope    — decide and record it
 */
const REASONS = ['no-provider', 'no-test-harness', 'not-implemented', 'out-of-scope'];

/**
 * Where the repeat key comes from. CLOSED, and the wrong answer is the whole first half of the
 * feature: a value the RECEIVER makes up at receive time is different on every delivery, so it can
 * never recognise a second delivery of the same event.
 */
const KEY_SOURCE = { 'СОБЫТИЕ-ОТПРАВИТЕЛЯ': 'sender', 'СГЕНЕРИРОВАН-ПОЛУЧАТЕЛЕМ': 'receiver' };

/**
 * How a second write is excluded. CLOSED, and `проверка-перед-вставкой` is a PROVEN defect rather
 * than a weaker option: two retries arrive CONCURRENTLY, both SELECT and both see nothing, both
 * INSERT. The read-then-write dedup passes every single-threaded test and fails on exactly the real
 * double delivery it was written for.
 */
const EXCLUSION = {
  'УНИКАЛЬНЫЙ-ИНДЕКС': 'atomic',
  'АТОМАРНАЯ-ВСТАВКА': 'atomic',
  'ПРОВЕРКА-ПЕРЕД-ВСТАВКОЙ': 'race',
};

/** What the signature is computed over. The signature covers exact BYTES; a parse plus re-serialise
 *  changes them (key order, spacing, unicode escapes), so verification can never succeed — and the
 *  usual "fix" for that is to switch verification off. */
const SIGNED_OVER = { 'СЫРОЕ-ТЕЛО': 'raw', 'РАЗОБРАННОЕ-ТЕЛО': 'reparsed' };

/** When it is verified. `после-разбора` means your parser — and often your business logic — already
 *  ran on unauthenticated attacker-controlled input. */
const SIGN_WHEN = { 'ДО-РАЗБОРА': 'before', 'ПОСЛЕ-РАЗБОРА': 'after' };

/** How the two digests are compared. A byte-by-byte compare that returns early leaks, through
 *  timing, how long a prefix matched — enough to reconstruct a valid signature. */
const COMPARISON = { 'ПОСТОЯННОЕ-ВРЕМЯ': 'constant', 'ОБЫЧНОЕ': 'naive' };

/**
 * How ordering is answered. CLOSED, and `гарантирован-отправителем` is a PROVEN defect: at-least-once
 * delivery with independent retries has no order, the providers' own documentation says so, and the
 * handler that relies on it breaks precisely on the retry that also produces the duplicate.
 */
const ORDER = {
  'ВЕРСИЯ-ИЗ-СОБЫТИЯ': 'versioned',
  'ПЕРЕСТАНОВОЧЕН': 'commutative',
  'ГАРАНТИРОВАН-ОТПРАВИТЕЛЕМ': 'assumed',
};

/**
 * The three failure classes, as a CLOSED and MANDATORY set.
 *
 * Mandatory is the load-bearing half. Two classes out of three answered is not an unknown — it is a
 * PROVEN omission whose name we can print. A handler that verifies signatures and credits the same
 * commission twice loses exactly as much money as one that never checked a signature.
 */
const CLASSES = ['подделка', 'повтор', 'перестановка'];

/** Per-class verdict. CLOSED: an unmapped spelling is refused and the recognised ones are printed. */
const CLASS_STATUS = { 'ЗАКРЫТ': 'closed', 'НЕ ЗАКРЫТ': 'open' };

/**
 * Key names that cannot distinguish "one event delivered twice" from "two genuine events" — and the
 * list is deliberately SHORT, because a wide blacklist refuses correct configurations and a check
 * that refuses the correct configuration gets switched off.
 *
 * The two directions fail differently and both cost money:
 *   a value that CHANGES per delivery (a timestamp, the moment of receipt) — the repeat looks new,
 *   and the commission is credited twice;
 *   a value SHARED by two genuine events (the amount, the total) — the second real payment is
 *   swallowed as a duplicate, and the partner is never paid at all.
 */
const BAD_KEY = [
  [/(^|[^a-zа-яё0-9_])(timestamp|created_?at|created|received_?at|now|время|метка[ _-]?времени)([^a-zа-яё0-9_]|$)/i,
    'меняется при КАЖДОЙ доставке, поэтому повтор выглядит новым событием'],
  [/(^|[^a-zа-яё0-9_])(amount|sum|total|сумма|итого)([^a-zа-яё0-9_]|$)/i,
    'совпадает у ДВУХ настоящих событий, поэтому второй законный платёж будет съеден как дубль'],
];

/**
 * Stores that do not survive what a webhook endpoint routinely survives.
 *
 * BOUNDED ON PURPOSE: `in-memory` is NOT here. Redis is an in-memory store and is a perfectly good
 * home for this key — it is shared between workers and it outlives a request. What fails is a store
 * INSIDE the application process: a dict, a module-level set, a per-process cache. It is empty after
 * every restart and invisible to the second replica, so the same event lands twice the moment you
 * scale to two workers — which is to say, in production and not in development.
 */
// NOTE the Cyrillic character classes below, and do not "simplify" them back to `\w`: in JavaScript
// `\w` is ASCII-only, so `глобальн\w*` matches nothing in `глобальный словарь` and the whole second
// mask is DEAD while looking correct. MEASURED 2026-09-01: the first run of P9 passed a contract
// declaring `глобальный словарь handled_ids` as the store with exit 0.
const BAD_STORE = [
  /(^|[^a-zа-яё])(память процесса|в памяти процесса|in-?process|process memory)/i,
  /(^|[^a-zа-яё])(локальн[а-яё]*\s+переменн[а-яё]*|глобальн[а-яё]*\s+(?:словар[а-яё]*|множеств[а-яё]*|переменн[а-яё]*))/i,
];

/**
 * The freshness window has an upper bound, and the bound is part of the property.
 *
 * The window exists to limit how long a captured-but-genuine request stays replayable. A window
 * measured in hours does not limit it — it merely writes the limit down. Providers' own tolerances
 * sit around five minutes; an hour is already generous, and everything under it passes untouched.
 */
const MAX_WINDOW_S = 3600;

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
  for (const line of lines || []) say('   • ' + line);
  if (tail) say('   ' + tail);
  process.exit(1);
}

/**
 * The value of a `**Label:** value` header line, or null when the label is absent entirely.
 * An EMPTY value is returned as '' and is never collapsed into "absent" — those are different
 * mistakes with different repairs (`honest-configuration` CFG-I2).
 */
function header(text, label) {
  const re = new RegExp('^\\s*\\*\\*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + ':?\\*\\*\\s*:?(.*)$', 'im');
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

/** A header that must merely be filled in — absent or empty is «не заполнено», not «нарушено». */
function requiredText(text, label, hint) {
  const raw = header(text, label);
  if (raw === null || raw === '' || /^[-—–]$/.test(raw) || /^\[.*\]$/.test(raw)) {
    cannotCheck('в контракте нет строки `**' + label + ':**` (или она пуста / всё ещё шаблон)', hint);
  }
  return raw;
}

/**
 * The failure-class table, as the contract records it.
 *
 * A row is a markdown table row whose FIRST cell is one of the three class names. The template ships
 * example rows, so a row whose evidence cell is still a bracketed placeholder is a TEMPLATE row and
 * is read as an EMPTY proof — never as a filled-in one.
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
      evidence: /^\[.*\]$/.test(evidence) ? '' : evidence,
    });
  }
  return rows;
}

/**
 * Every token in an evidence cell that LOOKS like a file: `dir/name.ext`, optionally followed by
 * `::test_name` or `:42`. Prose alone yields nothing, which the caller reads as "a claim with no
 * proof behind it" — the same defect as a widget proof that names no address.
 */
function evidenceFiles(cell) {
  const out = [];
  for (const m of String(cell || '').matchAll(/[A-Za-z0-9_./\\-]*[A-Za-z0-9_-]\.[A-Za-z0-9_]{1,10}/g)) {
    const token = m[0].split('::')[0].split('#')[0].replace(/[.,;)]+$/, '');
    if (/\.(md|txt)$/i.test(token)) continue;   // a document is not a test
    if (token.includes('/') || token.includes('\\') || /^test|test$|_test|spec/i.test(token)) {
      out.push(token.split('\\').join('/'));
    }
  }
  return [...new Set(out)];
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
        'это значит, что вопрос о входящих вебхуках НЕ ЗАДАВАЛСЯ — а НЕ что их нет; '
        + 'продукт без вебхуков отвечает `**Входящие вебхуки:** нет`, и это законный ответ');
    }
    cannotCheck('не читается ' + CONTRACT + ': ' + ((e && e.message) || e));
  }

  // 1. Does anything call in at all? «нет» is legitimate and has nothing to check → 2.
  const incoming = closedHeader(text, 'Входящие вебхуки', INCOMING,
    'без этой строки нельзя отличить «вебхуков нет» от «про вебхуки забыли»');
  if (!incoming) {
    cannotCheck('контракт говорит «Входящие вебхуки: нет» — чужие системы в продукт не звонят',
      'это законный ответ, а не нарушение; проверять нечего, поэтому не 0 и не 1');
  }

  requiredText(text, 'Отправитель',
    'кто присылает события — без имени отправителя неизвестна и схема подписи, которую вы проверяете');

  // 2. Was one event actually delivered twice? A named refusal is honest and exits 2.
  const run = closedHeader(text, 'Проверка повторной доставкой', RUN_STATUS,
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
    cannotCheck('повторная доставка НЕ ВОСПРОИЗВОДИЛАСЬ, причина: ' + picked[0],
      'честное «неизвестно», а не «обработчик идемпотентен»; до закрытия причины ни один из трёх '
      + 'классов отказа не проверен');
  }

  // 3. ПОВТОР. The key itself: named, from the sender, stored where it survives, excluded atomically.
  const key = requiredText(text, 'Ключ повторности',
    'назовите ПОЛЕ, по которому событие узнаётся вторично (например `event.id`) — '
    + '«сделаем идемпотентно» это не ключ, а намерение');
  for (const [pattern, why] of BAD_KEY) {
    if (pattern.test(key)) {
      proven('ключ повторности не различает повтор и новое событие', ['**Ключ повторности:** ' + key],
        why + '. Ключ обязан быть ТОЖДЕСТВОМ события у отправителя — тем полем, которое при '
        + 'повторной доставке ТО ЖЕ САМОЕ, а у двух разных событий РАЗНОЕ.');
    }
  }

  const source = closedHeader(text, 'Источник ключа', KEY_SOURCE,
    'ключ приходит В СОБЫТИИ или выдумывается на приёме');
  if (source === 'receiver') {
    proven('ключ повторности генерирует ПОЛУЧАТЕЛЬ', ['**Ключ повторности:** ' + key],
      'значение, придуманное в момент приёма, различно на каждой доставке — им нельзя узнать '
      + 'повтор в принципе. Возьмите идентификатор события у отправителя (`event.id`, '
      + '`Idempotency-Key`), он одинаков во всех попытках доставки одного события.');
  }

  const store = requiredText(text, 'Хранилище ключа',
    'где ключ лежит: таблица и колонка, ключ в Redis — покажите МЕСТО, а не намерение');
  for (const pattern of BAD_STORE) {
    if (pattern.test(store)) {
      proven('ключ хранится ВНУТРИ процесса', ['**Хранилище ключа:** ' + store],
        'такой стор пуст после каждого рестарта и невидим второй реплике: как только воркеров '
        + 'станет два, одно событие обработают оба. Нужен стор, общий для всех воркеров и '
        + 'переживающий рестарт (таблица в базе, ключ в Redis).');
    }
  }

  const exclusion = closedHeader(text, 'Механизм исключения', EXCLUSION,
    'чем именно исключается ВТОРАЯ запись');
  if (exclusion === 'race') {
    proven('исключение повтора построено на «прочитать, потом записать»', [
      '**Механизм исключения:** проверка-перед-вставкой',
    ],
    'две попытки доставки приходят ОДНОВРЕМЕННО: обе читают и обе не находят ключ, обе пишут — '
    + 'и комиссия начислена дважды. Такая дедупликация проходит любой однопоточный тест и падает '
    + 'ровно на той настоящей двойной доставке, ради которой написана. Нужна атомарная операция: '
    + 'уникальный индекс на колонке ключа и вставка, чей конфликт и есть ответ «уже обработано».');
  }

  // 4. ПОДДЕЛКА. Verified over the raw bytes, before parsing, in constant time, inside a window.
  const signedOver = closedHeader(text, 'Что подписано', SIGNED_OVER,
    'подпись считается по БАЙТАМ тела');
  if (signedOver === 'reparsed') {
    proven('подпись сверяется с ПЕРЕСОБРАННЫМ телом', ['**Что подписано:** разобранное-тело'],
      'разбор и обратная сборка меняют байты (порядок ключей, пробелы, экранирование), поэтому '
      + 'подпись не совпадёт НИКОГДА — а обычное «лечение» этого симптома состоит в том, чтобы '
      + 'выключить проверку. Сохраняйте сырое тело запроса и считайте подпись по нему.');
  }

  const when = closedHeader(text, 'Когда проверяется подпись', SIGN_WHEN,
    'до разбора тела или после');
  if (when === 'after') {
    proven('подпись проверяется ПОСЛЕ разбора тела', ['**Когда проверяется подпись:** после-разбора'],
      'к этому моменту ваш разборщик — а часто и бизнес-логика — уже отработали на данных, которые '
      + 'прислал кто угодно. Проверка подписи это ПЕРВОЕ действие обработчика, до любого разбора.');
  }

  const comparison = closedHeader(text, 'Сравнение подписи', COMPARISON,
    'обычное сравнение строк выдаёт длину совпавшего префикса временем ответа');
  if (comparison === 'naive') {
    proven('подписи сравниваются обычным сравнением', ['**Сравнение подписи:** обычное'],
      'сравнение, выходящее на первом несовпавшем байте, сообщает временем ответа, какой длины '
      + 'префикс угадан — по этому каналу подпись подбирается побайтно. Нужна функция постоянного '
      + 'времени (`hmac.compare_digest`, `crypto.timingSafeEqual`).');
  }

  const rawWindow = requiredText(text, 'Окно свежести (секунды)',
    'сколько секунд метке времени запроса позволено отстоять от текущего момента');
  if (/^(нет|no|none|отсутствует)$/i.test(rawWindow)) {
    proven('окна свежести нет', ['**Окно свежести (секунды):** ' + rawWindow],
      'корректно подписанный запрос, перехваченный однажды, остаётся годным ВЕЧНО: его можно '
      + 'переиграть через месяц и получить второе начисление. Подпись обязана покрывать метку '
      + 'времени, а обработчик — отвергать запрос старше окна.');
  }
  const window = Number(String(rawWindow).replace(',', '.').replace(/\s*(с|сек\w*|s|sec\w*)\s*$/i, ''));
  if (!Number.isFinite(window)) {
    cannotCheck('`Окно свежести (секунды)` не разбирается как число: ' + rawWindow,
      'нужно число секунд, например `300`');
  }
  if (window <= 0) {
    proven('окно свежести не ограничивает ничего', ['**Окно свежести (секунды):** ' + rawWindow],
      'ноль или отрицательное окно означает, что проверки возраста запроса нет.');
  }
  if (window > MAX_WINDOW_S) {
    proven('окно свежести шире часа', ['**Окно свежести (секунды):** ' + window],
      'окно существует, чтобы ОГРАНИЧИТЬ срок годности перехваченного запроса; окно в часы его не '
      + 'ограничивает, а лишь записывает. Собственные допуски отправителей — около пяти минут; '
      + 'всё до ' + MAX_WINDOW_S + ' с проходит без замечаний.');
  }

  // 5. ПЕРЕСТАНОВКА. The same retry topology, the third way it costs money.
  const order = closedHeader(text, 'Порядок событий', ORDER,
    'обработчик опирается на порядок или нет');
  if (order === 'assumed') {
    proven('обработчик полагается на порядок доставки', ['**Порядок событий:** гарантирован-отправителем'],
      'порядок НЕ гарантирован: попытки доставки независимы, поэтому событие, случившееся раньше, '
      + 'может приехать позже — и перезаписать более новое состояние. Это тот же ретрай, который '
      + 'даёт дубли, поэтому чинить дубли и верить в порядок нельзя одновременно. Либо применяйте '
      + 'событие только если его версия/время новее уже применённой (`версия-из-события`), либо '
      + 'сделайте обработчик перестановочным и объявите это.');
  }

  // 6. All three classes, each closed, each proof pointing at a test file THAT EXISTS.
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
    proven('класс отказа не назван вовсе (' + missing.length + ' из ' + CLASSES.length + ')', missing,
      'три класса это ЗАКРЫТЫЙ и ОБЯЗАТЕЛЬНЫЙ набор: обработчик, проверяющий подпись и начисляющий '
      + 'комиссию дважды, теряет ровно столько же денег, сколько тот, что подпись не проверял. '
      + 'Пропуск здесь — доказанная потеря, а не неизвестность.');
  }

  const open = rows.filter((r) => CLASS_STATUS[r.status] === 'open');
  if (open.length) {
    proven('проверка объявлена ВЫПОЛНЕННОЙ, но класс остался НЕ ЗАКРЫТ', open.map((r) => r.name),
      'либо закройте класс, либо объявите всю проверку НЕ ВЫПОЛНЕННОЙ с причиной — частичный '
      + 'прогон под вывеской выполненного и есть ложная квитанция.');
  }

  const noFile = [];
  const absent = [];
  for (const row of rows) {
    const files = evidenceFiles(row.evidence);
    if (!files.length) { noFile.push(row.name); continue; }
    const found = files.filter((f) => {
      try { return fs.statSync(path.join(root, f)).isFile(); } catch { return false; }
    });
    if (!found.length) absent.push(row.name + ' → ' + files.join(', '));
  }
  if (noFile.length) {
    proven('класс объявлен ЗАКРЫТЫМ, но доказательство не называет файл теста', noFile,
      'закрывает этот класс не решение, а ПРОГОН: событие, доставленное дважды, и утверждение, '
      + 'что начисление одно. Назовите файл теста — «проверено вручную» и «не проверяли» пишутся '
      + 'одинаково.');
  }
  if (absent.length) {
    proven('названный файл теста не существует', absent,
      'квитанция указывает на пустоту: путь искали от корня проекта и не нашли. Это доказанная '
      + 'потеря, а не неизвестность — мы посмотрели.');
  }

  say('✅ все ' + CLASSES.length + ' классов отказа закрыты: ключ повторности `' + key
    + '` из события отправителя, ' + 'исключение атомарное, подпись по сырому телу до разбора '
    + '(окно ' + window + ' с), порядок — ' + header(text, 'Порядок событий'));
  say('   Ограничение: это доказывает, что РЕШЕНИЯ приняты и записаны, а названные файлы тестов '
    + 'существуют — а НЕ что тест доставляет одно событие дважды и утверждает одно начисление, и '
    + 'не что уникальный индекс существует в развёрнутой схеме. Это доказывает только прогон.');
  process.exit(0);
}

try {
  main();
} catch (err) {
  // Even an unexpected failure must not read as "clean".
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err));
}
