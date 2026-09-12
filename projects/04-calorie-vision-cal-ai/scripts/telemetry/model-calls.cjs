#!/usr/bin/env node
// `AggregateModelCallLog` (FR-scan-pipeline-21, AC-scan-pipeline-34). Читает JSON-журнал
// `api`/`recognizer` (одна строка — один JSON, `@n4/shared` `createLogger`), группирует
// `START`/`OUTCOME` по `attempt_id`, метит непарные `START` старше грейс-периода `unknown`,
// печатает счётчики по (reason, outcome, model) и суммарное/среднее `ms`.
//
// Использование:
//   node scripts/telemetry/model-calls.cjs <файл-или-'-'-для-stdin> [--json] [--grace-ms N]
//
// НЕ сервис compose — вызывается по требованию (служебная веб-страница остаётся планом,
// явно вне недели MVP).

'use strict';

const fs = require('node:fs');
const readline = require('node:readline');

const DEFAULT_GRACE_MS = 2 * 60 * 1000;

function reasonFromModel(model) {
  // `reason` не пишется в событие явно — выводится из `call_no` (1 = primary, 2 = escalation),
  // а поле `call_no` есть только в START. Ключ группировки строится по `attempt_id`, и OUTCOME
  // без своего START не может определить reason иначе, чем `unknown-reason`.
  return model === 'sonnet-5' ? 'escalation' : 'primary';
}

async function readLines(source) {
  const stream = source === '-' ? process.stdin : fs.createReadStream(source, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const lines = [];
  for await (const line of rl) {
    if (line.trim() !== '') lines.push(line);
  }
  return lines;
}

function parseArgs(argv) {
  const args = { json: false, graceMs: DEFAULT_GRACE_MS, source: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--grace-ms') {
      i += 1;
      args.graceMs = Number.parseInt(argv[i], 10);
    } else if (args.source === undefined) args.source = arg;
  }
  return args;
}

function aggregate(lines, graceMs, nowMs) {
  const starts = new Map(); // attempt_id -> {model, ts, day}
  const outcomes = new Map(); // attempt_id -> latest outcome record (last wins: 'late' переписывает предыдущий)

  for (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.event !== 'model_call') continue;

    if (event.phase === 'START') {
      starts.set(event.attempt_id, { model: event.model, ts: Date.parse(event.time ?? event.ts ?? ''), day: event.day });
    } else if (event.phase === 'OUTCOME') {
      outcomes.set(event.attempt_id, { outcome: event.outcome, ms: event.ms, model: starts.get(event.attempt_id)?.model });
    }
  }

  const groups = new Map(); // "reason|outcome|model" -> {count, sumMs}
  const bump = (reason, outcome, model, ms) => {
    const key = `${reason}|${outcome}|${model ?? 'unknown'}`;
    const existing = groups.get(key) ?? { reason, outcome, model: model ?? 'unknown', count: 0, sumMs: 0 };
    existing.count += 1;
    existing.sumMs += typeof ms === 'number' ? ms : 0;
    groups.set(key, existing);
  };

  for (const [attemptId, outcome] of outcomes) {
    const start = starts.get(attemptId);
    const model = outcome.model ?? start?.model;
    bump(reasonFromModel(model), outcome.outcome, model, outcome.ms);
  }

  for (const [attemptId, start] of starts) {
    if (outcomes.has(attemptId)) continue;
    const age = nowMs - (Number.isFinite(start.ts) ? start.ts : nowMs);
    if (age > graceMs) bump(reasonFromModel(start.model), 'unknown', start.model, undefined);
  }

  return Array.from(groups.values());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.source === undefined) {
    process.stderr.write('использование: model-calls.cjs <файл|-> [--json] [--grace-ms N]\n');
    process.exitCode = 2;
    return;
  }
  const lines = await readLines(args.source);
  const groups = aggregate(lines, args.graceMs, Date.now());

  if (args.json) {
    process.stdout.write(`${JSON.stringify(groups)}\n`);
    return;
  }

  process.stdout.write('reason      outcome    model        count  sum_ms   avg_ms\n');
  for (const group of groups.sort((a, b) => a.reason.localeCompare(b.reason) || a.outcome.localeCompare(b.outcome))) {
    const avg = group.count > 0 ? Math.round(group.sumMs / group.count) : 0;
    process.stdout.write(
      `${group.reason.padEnd(11)} ${group.outcome.padEnd(10)} ${group.model.padEnd(12)} ${String(group.count).padEnd(6)} ${String(group.sumMs).padEnd(8)} ${avg}\n`,
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`агрегатор не выполнен: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { aggregate, reasonFromModel };
