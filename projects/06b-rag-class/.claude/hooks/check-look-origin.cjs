#!/usr/bin/env node
'use strict';

/**
 * check-look-origin.cjs — did a third-party design-analysis row reach Specification.md before a
 * dated live run confirmed it?
 *
 * NOT an event hook. Invoke deliberately:
 *
 *   node .claude/hooks/check-look-origin.cjs [path-to-project]
 *
 * Exit codes:
 *   0  provenance grammar is valid and no ГИПОТЕЗА/УСТАРЕЛО row was promoted
 *   1  a defect is proved: illegal closed-list value, incomplete third-party provenance, invalid
 *      confirmation dates, or promotion before confirmation; affected FR-LOOK-nnn rows are named
 *   2  THE CHECK DID NOT RUN: required input is absent/unreadable, the table cannot be parsed, or
 *      an internal error occurred
 *
 * Closed lists:
 *   Происхождение: прокликано | сторонний-разбор | вручную | не снято
 *   Статус строки: ЧЕРНОВИК | ГИПОТЕЗА | ПОДТВЕРЖДЕНО | УСТАРЕЛО
 *   Confirmation: подтверждено: живой прогон YYYY-MM-DD · сторонний снимок YYYY-MM-DD
 *
 * Unlike check-look-trace, an illegal closed-list value is exit 1, not 2. Here the value IS the
 * assertion being checked; treating a misspelling as "not checked" would hide a proved bad claim.
 * A proved defect outranks an unanswered check. Dates are compared at day granularity; equality is
 * allowed, while absent, unparseable or future dates degrade to "no date" and are refused.
 */

const fs = require('node:fs');
const path = require('node:path');

const PROFILE = path.join('docs', 'source-product-profile.md');
const SPEC = path.join('docs', 'Specification.md');
const ORIGINS = ['прокликано', 'сторонний-разбор', 'вручную', 'не снято'];
const ROW_STATUSES = ['ЧЕРНОВИК', 'ГИПОТЕЗА', 'ПОДТВЕРЖДЕНО', 'УСТАРЕЛО'];
const BLOCKED_STATUSES = new Set(['ГИПОТЕЗА', 'УСТАРЕЛО']);
const ID = /\bFR-LOOK-(\d{3})\b/g;
const REJECT_WORD = /(отклон\w*|не берём|не беремся|не берем|rejected|declined|out of scope|вне области)/i;
const CONFIRMATION = /подтверждено:\s*живой прогон\s+(\S+)\s*·\s*сторонний снимок\s+(\S+)/i;

function say(s) { process.stdout.write(s + '\n'); }

function cannotCheck(reason, hint) {
  say('⚠️  проверка НЕ выполнена: ' + reason);
  if (hint) say('    ' + hint);
  process.exit(2);
}

function readRequired(root, rel, absentReason, hint) {
  const abs = path.join(root, rel);
  let st;
  try { st = fs.statSync(abs); } catch { cannotCheck(absentReason, hint); }
  if (!st.isFile()) cannotCheck(rel + ' существует, но это не файл');
  try { return fs.readFileSync(abs, 'utf8'); } catch (err) {
    cannotCheck('не читается ' + rel + ': ' + String((err && err.message) || err));
  }
  return '';
}

function header(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^\\s*\\*\\*' + escaped + ':?\\*\\*\\s*:?(.*)$', 'im');
  const m = re.exec(text);
  return m ? m[1].trim().replace(/^[«"`]|[»"`]$/g, '').trim() : null;
}

function seedRows(profile) {
  const rows = [];
  let hasHeader = false;
  for (const raw of profile.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    if (/^\|\s*ID\s*\|/i.test(line) && /\|\s*Статус\s*\|/i.test(line)) hasHeader = true;
    const cells = line.split('|').map((cell) => cell.trim());
    if (!/^FR-LOOK-\d{3}$/.test(cells[1] || '')) continue;
    if (cells.length < 8) cannotCheck('таблица seed не разбирается: у ' + cells[1] + ' нет всех колонок');
    const requirement = cells[2] || '';
    const placeholder = /^\[.*\]$/.test(requirement) || requirement === '...' || requirement === '';
    if (placeholder) continue;
    rows.push({ id: cells[1], status: cells[6] || '', raw: line });
  }
  if (!hasHeader) {
    cannotCheck('таблица seed не разбирается: нет шапки с колонками ID и Статус',
      'ожидается таблица Look Requirements Seed из docs/source-product-profile.md');
  }
  const dupes = [...new Set(rows.map((row) => row.id).filter((id, i, all) => all.indexOf(id) !== i))];
  if (dupes.length) cannotCheck('в таблице seed повторяются идентификаторы: ' + dupes.join(', '));
  return rows;
}

function parseDay(raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw || '')) return null;
  const [year, month, day] = raw.split('-').map(Number);
  const value = Date.UTC(year, month - 1, day);
  const parsed = new Date(value);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1
      || parsed.getUTCDate() !== day) return null;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return value <= today ? value : null;
}

function mentioned(spec) {
  const out = new Set();
  for (const line of spec.split('\n')) {
    if (REJECT_WORD.test(line)) continue;
    ID.lastIndex = 0;
    for (let m = ID.exec(line); m !== null; m = ID.exec(line)) out.add(m[0]);
  }
  return out;
}

function rejected(profile, spec, id) {
  const re = new RegExp('^.*\\b' + id + '\\b.*$', 'gm');
  for (const text of [profile, spec]) {
    for (const line of text.match(re) || []) {
      const match = REJECT_WORD.exec(line);
      if (!match) continue;
      const tail = line.slice(match.index + match[0].length);
      const reason = /[\p{L}\p{N}][\p{L}\p{N}\s]{6,}/u
        .test(tail.replace(/^[\s:—–-]+/, ''));
      if (reason) return true;
    }
  }
  return false;
}

function quote(value) { return '«' + (value === '' ? '(пусто)' : value) + '»'; }

function refuse(errors) {
  say('❌ проверка происхождения отказала:');
  for (const error of errors) say('   • ' + error);
  process.exit(1);
}

function main() {
  const root = process.argv[2] || '.';
  try { if (!fs.statSync(root).isDirectory()) cannotCheck('это не каталог: ' + root); }
  catch { cannotCheck('путь не существует: ' + root); }

  const profile = readRequired(root, PROFILE, 'нет файла ' + PROFILE,
    'без профиля происхождение строк проверить невозможно');
  const rows = seedRows(profile);
  const errors = [];

  const origin = header(profile, 'Происхождение');
  const hypothesisRows = rows.filter((row) => BLOCKED_STATUSES.has(row.status));
  const originValid = origin !== null && ORIGINS.includes(origin);

  if (origin !== null && !originValid) {
    errors.push('Происхождение ' + quote(origin) + ' не из закрытого списка: ' + ORIGINS.join(' | '));
  }
  for (const row of rows) {
    if (!ROW_STATUSES.includes(row.status)) {
      errors.push(row.id + ': Статус ' + quote(row.status) + ' не из закрытого списка: '
        + ROW_STATUSES.join(' | '));
    }
  }

  if (origin === null && hypothesisRows.length) {
    errors.push('нет строки `**Происхождение:**` для гипотезных строк: '
      + hypothesisRows.map((row) => row.id).join(', '));
  }

  let snapshotDay = null;
  let snapshotRaw = null;
  if (origin === 'сторонний-разбор') {
    const source = header(profile, 'Источник разбора');
    snapshotRaw = header(profile, 'Дата стороннего снимка');
    if (source === null || source === '') {
      errors.push('при сторонний-разбор обязательна непустая строка `**Источник разбора:**`');
    }
    snapshotDay = parseDay(snapshotRaw);
    if (snapshotRaw === null || snapshotRaw === '') {
      errors.push('при сторонний-разбор обязательна строка `**Дата стороннего снимка:**` YYYY-MM-DD');
    } else if (snapshotDay === null) {
      errors.push('Дата стороннего снимка ' + quote(snapshotRaw)
        + ' отсутствует, неразбираема или находится в будущем');
    }
    for (const row of rows.filter((candidate) => candidate.status === 'ЧЕРНОВИК')) {
      errors.push(row.id + ': строка стороннего разбора входит только как ГИПОТЕЗА, не ЧЕРНОВИК');
    }
  } else if (originValid && hypothesisRows.length) {
    errors.push('строки ' + hypothesisRows.map((row) => row.id).join(', ')
      + ' имеют статус ГИПОТЕЗА/УСТАРЕЛО, но Происхождение не равно сторонний-разбор');
  }

  for (const row of rows.filter((candidate) => candidate.status === 'ПОДТВЕРЖДЕНО')) {
    const match = CONFIRMATION.exec(row.raw);
    if (!match) {
      errors.push(row.id + ': ПОДТВЕРЖДЕНО требует запись `подтверждено: живой прогон YYYY-MM-DD '
        + '· сторонний снимок YYYY-MM-DD`');
      continue;
    }
    const liveRaw = match[1];
    const confirmedSnapshotRaw = match[2];
    const liveDay = parseDay(liveRaw);
    const confirmedSnapshotDay = parseDay(confirmedSnapshotRaw);
    if (liveDay === null || confirmedSnapshotDay === null) {
      errors.push(row.id + ': даты подтверждения ' + quote(liveRaw) + ' / '
        + quote(confirmedSnapshotRaw) + ' отсутствуют, неразбираемы или находятся в будущем');
      continue;
    }
    if (liveDay < confirmedSnapshotDay) {
      errors.push(row.id + ': живой прогон ' + liveRaw + ' старше стороннего снимка '
        + confirmedSnapshotRaw + ' — это не подтверждение');
    }
    if (snapshotDay !== null && confirmedSnapshotDay !== snapshotDay) {
      errors.push(row.id + ': сторонний снимок в подтверждении ' + confirmedSnapshotRaw
        + ' не совпадает с полем профиля ' + snapshotRaw);
    }
  }

  // A proved grammar/date defect is older than an input that would be needed only for promotion.
  if (errors.length) refuse(errors);

  const spec = readRequired(root, SPEC, 'нет файла ' + SPEC,
    'без Specification.md нельзя проверить шов промоушена');
  const seen = mentioned(spec);
  const promoted = hypothesisRows.filter((row) => seen.has(row.id) && !rejected(profile, spec, row.id));
  if (promoted.length) {
    refuse(['без датированного живого подтверждения промотированы строки: '
      + promoted.map((row) => row.id).join(', ')]);
  }

  if (origin === null) {
    say('✅ legacy-профиль: поля Происхождение нет, гипотезных строк нет — совместимость сохранена');
  } else {
    say('✅ происхождение проверено: непромотированных строк ГИПОТЕЗА/УСТАРЕЛО — '
      + hypothesisRows.length);
  }
  process.exit(0);
}

try {
  main();
} catch (err) {
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err));
}
