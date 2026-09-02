#!/usr/bin/env node
'use strict';

/**
 * check-external-deps.cjs — инвентарь чужих сервисов ЕСТЬ, и каждая строка несёт вердикт?
 *
 * NOT an event hook, and here that is a requirement rather than a habit: this package's hooks are
 * NON-BLOCKING by contract (pinned by tests/unit/hooks-project-anchored.test.js, which requires exit
 * 0), so a hook could only print — it could never refuse. Invoke it, in the form of its two
 * siblings `check-growth-trace.cjs` and `check-look-trace.cjs`:
 *
 *   node .claude/hooks/check-external-deps.cjs [path-to-project]
 *
 * WHAT IS ALREADY SHIPPED, AND IS NOT RE-CREATED HERE. The inventory itself (five columns), the
 * three verdicts CONFIRMED / UNCONFIRMED / CONTRADICTED, the requirement that evidence carry a
 * VERBATIM QUOTE rather than a bare link, the sixth validator lens and the Phase-2 output rows — all
 * of it exists in `skills/sparc-prd-mini/SKILL.md` and is pinned by
 * tests/unit/external-dependency-check.test.js. This file adds the one thing that was missing.
 *
 * THE MISSING THING: NOBODY ENFORCED IT.
 *
 * The template FORMULATES the rule in its own words — write literally *"No external dependencies —
 * this product calls no third-party service"*, because «an empty section and an absent section are
 * indistinguishable, and only one of them means anything». And then the only consumers of the
 * inventory are a PROSE LENS read by a model and two rows of an output table. Layer 3-4, both of
 * them, and a lens with nothing to read cannot tell «there are no dependencies» from «nobody wrote
 * the section».
 *
 * THE VACUOUS TRUTH THAT MAKES IT WORSE. The Phase-2 green verdict reads «no external dependency
 * UNCONFIRMED or CONTRADICTED». Over an EMPTY SET that sentence is true by itself — a green verdict
 * obtained by having nothing to look at. That is why an absent section here is exit 2 and can never
 * be exit 0: the one outcome this file exists to make unavailable is a clean answer produced by
 * absence.
 *
 * MEASURED 2026-09-01 on a tree carrying the full set of Phase-1 documents whose `Architecture.md`
 * has NO `## External Dependencies` section: `check-docs-complete` 0, `check-growth-trace` 0,
 * `check-look-trace` 0, and the remaining four exit 2. Not one of them named the missing inventory.
 * They are not broken — they answer their own questions correctly, and nothing was asking this one.
 *
 * WHAT THIS FILE CAN AND CANNOT DECIDE — read before trusting exit 0.
 *
 * It settles that the inventory EXISTS, that it was filled in rather than left as the shipped
 * template, that every row carries a verdict from the closed three, that no row is CONTRADICTED, and
 * that a row claiming CONFIRMED carries the three things the rule demands as proof: a link, a check
 * date, and a verbatim quote. It CANNOT open the link, and it cannot tell a real quote from an
 * invented one — a fabricated quotation passes here and is caught, if at all, by a human or a
 * browser. That stays layer 3, and the exit-0 text says so rather than letting a green verdict imply
 * otherwise.
 *
 * Exit codes — three, and the third is the point:
 *   0  the inventory exists, is filled in, and every row carries a verdict; UNCONFIRMED rows are
 *      NAMED in the output because their requirements may not enter Phase 3 unresolved
 *   1  a defect is PROVEN and named: a row with no verdict or an unrecognised one, a CONTRADICTED
 *      row, or a CONFIRMED row whose evidence lacks a link, a date, or a verbatim quote
 *   2  THE CHECK DID NOT RUN — no Architecture.md, NO `## External Dependencies` SECTION AT ALL, a
 *      section holding only the shipped template row, duplicate rows, or the legitimate answer «no
 *      external dependencies», written in the words the rule prescribes
 *
 * The two exit-2 reasons that matter most are kept APART in the output, because they are opposite
 * facts wearing the same code: an absent section means the question was never ASKED; the «no
 * external dependencies» sentence means it was asked and answered. Printing them identically would
 * rebuild the very confusion this file removes.
 */

const fs = require('node:fs');
const path = require('node:path');

const ARCH = path.join('docs', 'Architecture.md');
const HEADING = /^#{2,6}\s+External Dependencies\s*$/i;

/** The closed three. Two would hide a difference that matters: «nobody could cite it» and «the
 *  provider's own docs say it cannot» need different repairs and have different consequences. */
const VERDICTS = { CONFIRMED: 'confirmed', UNCONFIRMED: 'unconfirmed', CONTRADICTED: 'contradicted' };

/** The sentence the rule prescribes for a product that genuinely calls nobody. Matched loosely on
 *  wording but strictly on MEANING: it must be an explicit statement, not an empty section. */
const NO_DEPS = /no external dependenc\w*|внешних зависимостей нет|не вызывает (?:ни одного )?(?:стороннего|чужого) сервис/i;

/** A verbatim quote: text inside quotation marks, long enough to be a sentence fragment rather than
 *  a word. The rule demands it precisely because a URL is the cheapest possible forgery. */
const QUOTE = /[«"“”']\s*[^«»"“”']{12,}\s*[»"“”']|`[^`]{12,}`/;

/** A link, and a date the evidence was checked. Both are demanded by the rule for CONFIRMED, and
 *  they are reported SEPARATELY because their repairs differ: one is «go find the page», the other
 *  is «say when you looked». */
const LINK = /\bhttps?:\/\/\S+/i;
const CHECKED = /\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/;

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
 * The body of the `## External Dependencies` section, or null when the heading is absent.
 *
 * Read PER SECTION and not from the whole document, for the reason the whole file is about: the
 * Technology Stack table sits directly above and has three columns of its own. A global scan would
 * read its rows as inventory rows with no verdict and report a defect that is not there — an answer
 * to a neighbouring question, delivered with confidence.
 *
 * Fenced blocks are skipped, so a `##` inside an example cannot invent a section.
 */
function section(text) {
  const lines = text.split('\n');
  let fenced = false;
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fenced = !fenced; continue; }
    if (fenced) continue;
    if (start < 0) {
      if (HEADING.test(lines[i].trim())) { start = i; level = /^(#+)/.exec(lines[i].trim())[1].length; }
      continue;
    }
    const m = /^(#{1,6})\s+\S/.exec(lines[i].trim());
    if (m && m[1].length <= level) return lines.slice(start + 1, i).join('\n');
  }
  return start < 0 ? null : lines.slice(start + 1).join('\n');
}

/**
 * The inventory rows.
 *
 * Five columns: capability, provider, evidence, verdict, requirements. A row whose FIRST cell is a
 * bracketed placeholder is the SHIPPED TEMPLATE row, not a real dependency — counting it would let
 * an untouched template look like a filled-in inventory, which is the same substitution as an
 * absent section, one level in.
 */
function rows(body) {
  const out = [];
  let templates = 0;
  let fenced = false;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 7) continue;                    // '' + 5 columns + ''
    const capability = cells[1];
    if (!capability || /^:?-+:?$/.test(capability)) continue;
    if (/^capability/i.test(capability)) continue;                       // header row
    if (/^\[.*\]$/.test(capability) || capability === '...') { templates += 1; continue; }
    out.push({
      capability,
      provider: cells[2],
      evidence: cells[3],
      verdict: cells[4].toUpperCase().replace(/[^A-Z]/g, ''),
      requirements: cells[5],
    });
  }
  return { out, templates };
}

function main() {
  const root = process.argv[2] || '.';
  try { if (!fs.statSync(root).isDirectory()) cannotCheck('это не каталог: ' + root); }
  catch { cannotCheck('путь не существует: ' + root); }

  const abs = path.join(root, ARCH);
  let text;
  try {
    if (!fs.statSync(abs).isFile()) cannotCheck(ARCH + ' существует, но это не файл');
    text = fs.readFileSync(abs, 'utf-8');
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      cannotCheck('нет файла ' + ARCH,
        'Фаза 1 не дописана — это НЕ «внешних зависимостей нет»');
    }
    cannotCheck('не читается ' + ARCH + ': ' + ((e && e.message) || e));
  }

  // THE FIXTURE THE WHOLE FILE IS BUILT AROUND: an absent section is exit 2 with a NAMED reason, and
  // it is never, under any circumstance, exit 0.
  const body = section(text);
  if (body === null) {
    cannotCheck('в ' + ARCH + ' нет раздела `## External Dependencies`',
      'ОТСУТСТВУЮЩИЙ раздел — это НЕ «зависимостей нет»: пустое множество делает зелёный вердикт '
      + '«ни одна внешняя зависимость не UNCONFIRMED и не CONTRADICTED» истинным САМО СОБОЙ. '
      + 'Продукт, который действительно никого не зовёт, пишет это дословно: «No external '
      + 'dependencies — this product calls no third-party service.»');
  }

  const { out, templates } = rows(body);

  // The legitimate answer — and it is a DIFFERENT fact from the one above, so it prints differently.
  if (out.length === 0 && NO_DEPS.test(body)) {
    cannotCheck('раздел объявляет: внешних зависимостей нет',
      'это законный ответ, а не нарушение, и он отличается от отсутствующего раздела ровно тем, '
      + 'что вопрос БЫЛ задан и на него ответили. Сверять нечего, поэтому не 0 и не 1.');
  }
  if (out.length === 0) {
    cannotCheck(templates
      ? 'в разделе только шаблонная строка (' + templates + ') — инвентарь не заполняли'
      : 'раздел `## External Dependencies` есть, но он пуст',
      'пустой раздел и отсутствующий отличаются только на глаз, а значат одно и то же: вопрос не '
      + 'закрыт. Либо перечислите способности, либо напишите дословно «No external dependencies — '
      + 'this product calls no third-party service.»');
  }

  const keys = out.map((r) => (r.capability + '|' + r.provider).toLowerCase());
  const dupes = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  if (dupes.length) {
    cannotCheck('в инвентаре повторяются строки: ' + dupes.join(', '),
      'одна способность у одного поставщика — одна строка; иначе один вердикт закрывает два '
      + 'разных вопроса');
  }

  // A row with no verdict is a PROVEN defect, not an unknown: the inventory's entire job is to
  // carry a verdict, and a row that carries none was written as if it had one.
  const noVerdict = out.filter((r) => !Object.prototype.hasOwnProperty.call(VERDICTS, r.verdict));
  if (noVerdict.length) {
    proven('строка инвентаря без вердикта из закрытой тройки',
      noVerdict.map((r) => r.capability + ' (' + (r.provider || 'поставщик не назван') + ') → '
        + (r.verdict || '(пусто)')),
      'допустимы ровно: ' + Object.keys(VERDICTS).join(' | ') + '. Строка без вердикта выглядит '
      + 'как проверенная и не проверена ничем — именно этот разрыв и делает зелёный вердикт Фазы 2 '
      + 'бессодержательным.');
  }

  const contradicted = out.filter((r) => VERDICTS[r.verdict] === 'contradicted');
  if (contradicted.length) {
    proven('способность CONTRADICTED — документация поставщика говорит, что он так не умеет',
      contradicted.map((r) => r.capability + ' (' + r.provider + ')'
        + (r.requirements ? ' ← ' + r.requirements : '')),
      'требования из последней колонки опираются на то, чего нет. Это 🔴, а не примечание: '
      + 'переписать требование на подтверждаемую способность либо сменить поставщика.');
  }

  // CONFIRMED carries the burden the rule puts on it: a link, a date, and a VERBATIM QUOTE. Reported
  // apart because the repairs differ — «find the page», «say when you looked», «quote the sentence».
  const confirmed = out.filter((r) => VERDICTS[r.verdict] === 'confirmed');
  const noQuote = confirmed.filter((r) => !QUOTE.test(r.evidence));
  const noLink = confirmed.filter((r) => !LINK.test(r.evidence));
  const noDate = confirmed.filter((r) => !CHECKED.test(r.evidence));
  if (noQuote.length) {
    proven('CONFIRMED без ДОСЛОВНОЙ ЦИТАТЫ',
      noQuote.map((r) => r.capability + ' (' + r.provider + ')'),
      'правдоподобная ссылка — самая дешёвая подделка из возможных, и ровно поэтому правило '
      + 'требует цитату, а не ссылку: цитата называет СПОСОБНОСТЬ, ссылка называет только страницу. '
      + 'Приведите короткую дословную фразу со страницы поставщика в кавычках.');
  }
  if (noLink.length) {
    proven('CONFIRMED без ссылки на документацию поставщика',
      noLink.map((r) => r.capability + ' (' + r.provider + ')'),
      'цитата без адреса непроверяема: её нельзя открыть и сверить. Нужны оба.');
  }
  if (noDate.length) {
    proven('CONFIRMED без даты проверки',
      noDate.map((r) => r.capability + ' (' + r.provider + ')'),
      'то, что API умеет, ДРЕЙФУЕТ. Подтверждение без даты не даёт понять, устарело оно или нет, '
      + 'а устаревший факт, записанный как доказательство, хуже его отсутствия.');
  }

  const unconfirmed = out.filter((r) => VERDICTS[r.verdict] === 'unconfirmed');
  say('✅ инвентарь на месте: ' + out.length + ' способност(ей), у каждой вердикт из закрытой тройки '
    + '(' + confirmed.length + ' CONFIRMED, ' + unconfirmed.length + ' UNCONFIRMED)');
  if (unconfirmed.length) {
    say('   UNCONFIRMED — не отказ, но и не бесплатный пропуск. Требования этих строк НЕ входят в '
      + 'Фазу 3, пока их не отложат, не уберут или не перепишут:');
    for (const r of unconfirmed) {
      say('   • ' + r.capability + ' (' + r.provider + ')' + (r.requirements ? ' ← ' + r.requirements : ''));
    }
  }
  say('   Ограничение: проверка НЕ ОТКРЫВАЕТ ссылку и не отличает настоящую цитату от выдуманной. '
    + 'Доказано, что доказательство ПРЕДЪЯВЛЕНО в требуемой форме, — не что оно истинно (слой 3).');
  process.exit(0);
}

try {
  main();
} catch (err) {
  // Even an unexpected failure must not read as "clean".
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err));
}
