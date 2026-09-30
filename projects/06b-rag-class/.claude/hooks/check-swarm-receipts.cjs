#!/usr/bin/env node
'use strict';

/**
 * check-swarm-receipts.cjs — did the parallel work units actually DELIVER, or is the coordinator
 * about to aggregate silence?
 *
 * THE FAILURE THIS EXISTS FOR. A worker that died looks exactly like a worker that is still
 * running: both are silent. Silence therefore reads as "in progress", and a coordinator can
 * report in good faith that the review is running when no review exists. The cure is to make the
 * RESULT of every unit a FILE at a named path: no file, no work — and that is a fact a machine can
 * establish, not a feeling a reader has to trust. This utility is that machine.
 *
 * NOT an event hook. Like `check-ports.cjs`, `check-growth-trace.cjs` and `check-look-trace.cjs`,
 * it lives here because this directory already carries plain Node utilities; nothing registers it
 * in settings.json. That is deliberate and load-bearing: this package's hooks are NON-BLOCKING by
 * contract (pinned by tests/unit/hooks-project-anchored.test.js, which requires exit 0), so a hook
 * could never refuse anything — it could only print. Invoke it:
 *
 *   node .claude/hooks/check-swarm-receipts.cjs <path-to-receipts-manifest.json>
 *
 * Exit codes — three, and the third is the point:
 *   0  every required receipt is a fresh, substantive, terminal file ending `Status: completed`
 *   1  at least one unit is UNDELIVERED or delivered a `Status: failed` — refuse aggregation
 *   2  THE CHECK DID NOT RUN — no manifest, malformed assignment, or an inconclusive probe
 *
 * A checker that answers "clean" when it could not look converts an unknown into a reassurance,
 * which is the same substitution the whole contract exists to refuse. So an unreadable trace is
 * exit 2, never 0; and a missing trace whose worker PID is still ALIVE is exit 2 as well — a live
 * worker may extend waiting, but liveness has never been delivery.
 *
 * MANIFEST SHAPE (the coordinator writes it BEFORE dispatch, which is what makes freshness
 * checkable at all — `launchMs` has to be recorded before the workers can write):
 *
 *   {
 *     "runId":    "<run-unique id>",
 *     "launchMs": 1756728000000,          // Date.now() captured immediately before dispatch
 *     "units": [
 *       { "workUnitId": "api",  "tracePath": "/abs/path/api.md",  "pid": 12345 },
 *       { "workUnitId": "docs", "tracePath": "/abs/path/docs.md" }
 *     ]
 *   }
 *
 * `pid` is optional and can only ever move an ABSENT trace between "undelivered" and "still
 * waiting". It can never turn a missing file into a delivery.
 */

const fs = require('node:fs');
const path = require('node:path');

const TERMINAL = /^Status: (completed|failed)$/;

function say(s) { process.stdout.write(s + '\n'); }

/** Exit 2 with a reason. Never merged with "clean": not-run and not-violated are different facts. */
function cannotCheck(reason, hint) {
  say('⚠️  проверка НЕ выполнена: ' + reason);
  if (hint) say('    ' + hint);
  process.exit(2);
}

/**
 * Is the worker behind this unit still alive?
 *
 * Three answers, because two would be a lie. `signal 0` tells us the process exists (`live`) or is
 * gone (`dead`); anything else — EPERM on a process we do not own, a malformed pid — is `unknown`,
 * and an unknown liveness must never be read as either.
 */
function liveness(pid) {
  if (pid === undefined || pid === null) return 'unknown';
  if (!Number.isInteger(pid) || pid <= 0) return 'unknown';
  try { process.kill(pid, 0); return 'live'; } catch (e) {
    return e && e.code === 'ESRCH' ? 'dead' : 'unknown';
  }
}

/**
 * The whole verdict for ONE unit, as a state plus a reason.
 *
 * The order of the checks is the contract, not a convenience. Assignment first: a relative or
 * duplicated `TRACE_PATH` means the DISPATCH was wrong, and a wrong dispatch cannot produce a
 * meaningful verdict about delivery. Then existence, then regular-file, then freshness, then
 * substance, then the terminal marker LAST — because the marker is written last, so a file that
 * has a body but no marker is a PARTIAL write, not a failure and not a success.
 */
function inspectReceipt(unit, launchMs) {
  const { workUnitId, tracePath } = unit;
  if (!workUnitId || typeof tracePath !== 'string' || !path.isAbsolute(tracePath)) {
    return { state: 'inconclusive', reason: 'assignment' };
  }
  const alive = liveness(unit.pid);
  let stat;
  try { stat = fs.lstatSync(tracePath); } catch (error) {
    if (error.code !== 'ENOENT') return { state: 'inconclusive', reason: 'unreadable' };
    // A live worker may only EXTEND waiting. It can never stand in for the file.
    if (alive === 'live') return { state: 'waiting', reason: 'positive-liveness-only' };
    return { state: 'undelivered', reason: alive === 'dead' ? 'dead-worker' : 'missing' };
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return { state: 'undelivered', reason: 'not-regular' };
  if (stat.mtimeMs <= launchMs) return { state: 'undelivered', reason: 'stale' };
  let body;
  try { body = fs.readFileSync(tracePath, 'utf-8'); } catch { return { state: 'inconclusive', reason: 'unreadable' }; }
  // Whitespace is exactly as empty as nothing. A size check alone would pass a lone newline.
  if (!body.trim()) return { state: 'undelivered', reason: 'empty' };
  const lines = body.trimEnd().split(/\r?\n/);
  const terminal = lines.at(-1);
  if (!TERMINAL.test(terminal)) return { state: 'undelivered', reason: 'non-terminal' };
  // A marker with nothing above it is a receipt for no work.
  if (!lines.slice(0, -1).join('\n').trim()) return { state: 'undelivered', reason: 'empty-payload' };
  return terminal === 'Status: completed'
    ? { state: 'completed', reason: 'terminal-receipt' }
    : { state: 'failed', reason: 'delivered-failure' };
}

function readManifest(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf-8'); } catch {
    cannotCheck('не читается манифест квитанций: ' + file,
      'манифест пишет КООРДИНАТОР до диспатча — его отсутствие значит, что рой запускали без учёта, '
      + 'а не что все отчитались');
  }
  let manifest;
  try { manifest = JSON.parse(raw); } catch (e) {
    cannotCheck('манифест не разбирается как JSON: ' + ((e && e.message) || e));
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    cannotCheck('манифест не является объектом');
  }
  if (!Number.isFinite(manifest.launchMs)) {
    cannotCheck('в манифесте нет числового launchMs',
      'без момента запуска нельзя отличить свежий след от файла, лежавшего здесь до роя');
  }
  const units = Array.isArray(manifest.units) ? manifest.units : null;
  if (!units) cannotCheck('в манифесте нет массива units');
  if (!units.length) {
    cannotCheck('в манифесте ноль рабочих единиц',
      'пустой рой нечего проверять — сказать «всё чисто» значило бы отчитаться о проверке, '
      + 'которой не было');
  }
  const ids = units.map((u) => u && u.workUnitId);
  const paths = units.map((u) => u && u.tracePath);
  const dupeIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupeIds.length) {
    cannotCheck('WORK_UNIT_ID повторяется: ' + dupeIds.join(', '),
      'один идентификатор на две единицы — одна квитанция зачлась бы за обе');
  }
  const dupePaths = [...new Set(paths.filter((p, i) => paths.indexOf(p) !== i))];
  if (dupePaths.length) {
    cannotCheck('TRACE_PATH повторяется: ' + dupePaths.join(', '),
      'два работника на один путь — второй перезапишет первого, и потеря будет молчаливой');
  }
  return manifest;
}

function main() {
  const file = process.argv[2];
  if (!file) {
    cannotCheck('не передан путь к манифесту квитанций',
      'использование: node .claude/hooks/check-swarm-receipts.cjs <manifest.json>');
  }
  const manifest = readManifest(file);
  const results = manifest.units.map((unit) => ({ unit, verdict: inspectReceipt(unit, manifest.launchMs) }));

  const bad = results.filter((r) => r.verdict.state === 'undelivered' || r.verdict.state === 'failed');
  const unknown = results.filter((r) => r.verdict.state === 'inconclusive' || r.verdict.state === 'waiting');
  const ok = results.filter((r) => r.verdict.state === 'completed');

  const line = (r) => '   • ' + (r.unit.workUnitId || '<без WORK_UNIT_ID>') + ' [' + r.verdict.state
    + '/' + r.verdict.reason + '] ' + (r.unit.tracePath || '<без TRACE_PATH>');

  if (bad.length) {
    say('❌ квитанции не собраны: ' + ok.length + ' из ' + results.length + ' завершены');
    for (const r of bad) say(line(r));
    for (const r of unknown) say(line(r));
    say('   Сведение, синтез и завершение ЗАПРЕЩЕНЫ, пока каждая требуемая квитанция не '
      + 'terminal-completed. Доклад агента — не квитанция; тишина — не прогресс.');
    process.exit(1);
  }
  if (unknown.length) {
    say('⚠️  проверка НЕ выполнена: ' + unknown.length + ' из ' + results.length
      + ' единиц не дали определённого ответа');
    for (const r of unknown) say(line(r));
    say('    Живой PID продлевает ожидание, но не заменяет файл; нечитаемый след — неизвестность, '
      + 'а не успех. Дождитесь следа или диагностируйте единицу и перезапустите проверку.');
    process.exit(2);
  }
  say('✅ все ' + results.length + ' квитанций свежие, содержательные и завершены Status: completed');
  say('   Ограничение: это доказывает, что работа ДОСТАВЛЕНА, а не что она верна.');
  process.exit(0);
}

try {
  main();
} catch (err) {
  // Even an unexpected failure must not read as "clean".
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err));
}
