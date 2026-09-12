#!/usr/bin/env node
// Сводка контролируемого сравнения плеч (EXP-N4-001 и любой другой batch_id).
//   node scripts/telemetry/compare-arms.cjs <каталог с прогонами> [--batch EXP-N4-001] [--json]
// Читает run.json и events.jsonl каждого прогона. Ничего не досчитывает за автора:
// отсутствующее значение печатается как «н/д», а не как ноль — 0/0 это «не измерено», а не «ноль».
// Код возврата: 0 — сводка построена; 1 — доказанный дефект данных (два прогона на один
// comparison_id, плечо без пары); 2 — ПРОВЕРКА НЕ ВЫПОЛНЕНА (каталога нет, ни одного run.json).
'use strict';
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const batch = (args.find((a) => a.startsWith('--batch=')) || '').split('=')[1]
  || (args.includes('--batch') ? args[args.indexOf('--batch') + 1] : null);
const asJson = args.includes('--json');
if (!dir) { console.error('❌ не назван каталог с прогонами — проверка НЕ выполнена'); process.exit(2); }
if (!fs.existsSync(dir)) { console.error(`❌ каталог ${dir} не существует — проверка НЕ выполнена`); process.exit(2); }

const runs = [];
for (const name of fs.readdirSync(dir).sort()) {
  const rj = path.join(dir, name, 'run.json');
  if (!fs.existsSync(rj)) continue;
  let run;
  try { run = JSON.parse(fs.readFileSync(rj, 'utf8')); }
  catch (e) { console.error(`❌ ${rj} нечитаем: ${e.message} — проверка НЕ выполнена`); process.exit(2); }
  const ev = path.join(dir, name, 'events.jsonl');
  run._events = fs.existsSync(ev)
    ? fs.readFileSync(ev, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];
  run._dir = path.join(dir, name);
  runs.push(run);
}
if (runs.length === 0) { console.error(`❌ в ${dir} нет ни одного run.json — проверка НЕ выполнена`); process.exit(2); }

const selected = runs.filter((r) => !batch || r.batch_id === batch);
if (selected.length === 0) { console.error(`❌ нет прогонов с batch_id=${batch} — проверка НЕ выполнена`); process.exit(2); }

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const show = (v, unit = '') => (v === null || v === undefined ? 'н/д' : `${v}${unit}`);
const minutes = (ms) => (ms === null ? null : Math.round(ms / 60000));

function summarise(run) {
  const ev = run._events;
  const started = ev.map((e) => e.timestamp).filter(Boolean).sort();
  const wallMs = num(run.metrics && run.metrics.elapsed_wall_ms)
    ?? (started.length >= 2 ? Date.parse(started[started.length - 1]) - Date.parse(started[0]) : null);
  const attempts = {};
  for (const e of ev) {
    if (e.type !== 'attempt_started' || !e.attempt_id) continue;
    const stage = (e.stage || 'UNKNOWN').toUpperCase();
    attempts[stage] = (attempts[stage] || 0) + 1;
  }
  // Исправления после QE: попытки реализации после первой (attempt_id implement-attempt-N, N>1).
  const correctiveImpl = ev.filter((e) => e.type === 'attempt_started'
    && /^implement-attempt-(\d+)$/.test(e.attempt_id || '')
    && Number(RegExp.$1) > 1).length;
  const reviews = ev.filter((e) => e.type === 'attempt_started' && (e.stage || '') === 'REVIEW').length;
  const q = run.quality || {};
  const sev = q.confirmed_findings_by_severity || null;
  const sevStr = sev ? Object.entries(sev).map(([k, v]) => `${k}:${v}`).join(' ') : null;
  const usage = run.metrics && run.metrics.usage;
  const cost = run.metrics && run.metrics.cost;
  return {
    run_id: run.run_id, feature: run.feature, arm: run.arm || null,
    arm_model: run.arm_model || null, tier: run.tier || null,
    comparison_id: run.comparison_id || null, status: run.status || null,
    wall_min: minutes(wallMs),
    active_min: minutes(num(run.metrics && run.metrics.active_wall_ms)),
    attempts_plan: attempts.PLAN || 0, attempts_validate: attempts.VALIDATE || 0,
    attempts_implement: attempts.IMPLEMENT || 0, attempts_review: reviews,
    corrective_impl: correctiveImpl,
    in_tokens: num(usage && usage.input_tokens), out_tokens: num(usage && usage.output_tokens),
    total_tokens: num(usage && usage.total_tokens),
    cost_usd: num(cost && (cost.total_usd ?? cost.usd)),
    ac_met: num(q.ac_met), ac_total: num(q.ac_total),
    gates: q.required_gates_passed === null || q.required_gates_passed === undefined ? null : q.required_gates_passed,
    findings: sevStr, telemetry_status: run.telemetry_status || null,
  };
}

const rows = selected.map(summarise);
let exitCode = 0;
const problems = [];

// Пары: comparison_id вида <batch>@<hash>/<slug>/<arm>
const pairs = new Map();
for (const r of rows) {
  if (!r.comparison_id) { problems.push(`прогон ${r.run_id} без comparison_id — в парное сравнение не входит`); continue; }
  const m = /^(.*)\/([^/]+)\/([AB])$/.exec(r.comparison_id);
  if (!m) { problems.push(`comparison_id ${r.comparison_id} не разбирается (ожидается <batch>@<hash>/<slug>/<A|B>)`); continue; }
  const key = `${m[1]}/${m[2]}`;
  if (!pairs.has(key)) pairs.set(key, {});
  if (pairs.get(key)[m[3]]) { problems.push(`два прогона на один ключ ${r.comparison_id}: ${pairs.get(key)[m[3]].run_id} и ${r.run_id}`); exitCode = 1; }
  pairs.get(key)[m[3]] = r;
}

if (asJson) { console.log(JSON.stringify({ batch: batch || 'all', runs: rows, problems }, null, 2)); process.exit(exitCode); }

console.log(`# Сравнение плеч — ${batch || 'все прогоны'} (${rows.length} прогонов)\n`);
console.log('## Прогоны\n');
console.log('| Фича | Плечо | Модель | Тир | Статус | Настенно, мин | Попытки P/V/I/R | Правок после QE | Токены | Стоимость, $ | AC | Ворота |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.feature} | ${show(r.arm)} | ${show(r.arm_model)} | ${show(r.tier)} | ${show(r.status)} | ${show(r.wall_min)} | ${r.attempts_plan}/${r.attempts_validate}/${r.attempts_implement}/${r.attempts_review} | ${r.corrective_impl} | ${show(r.total_tokens)} | ${show(r.cost_usd)} | ${r.ac_total === null ? 'н/д' : `${show(r.ac_met)}/${r.ac_total}`} | ${show(r.gates)} |`);
}

const complete = [...pairs.entries()].filter(([, p]) => p.A && p.B);
console.log(`\n## Контролируемые пары (${complete.length} полных из ${pairs.size})\n`);
if (complete.length === 0) {
  console.log('Полных пар нет: парное сравнение не выполнено. Это отсутствие измерения, а не результат «различий нет».');
} else {
  console.log('| Пара | Метрика | A | B | A − B |');
  console.log('|---|---|---|---|---|');
  for (const [key, p] of complete) {
    const slug = key.split('/').pop();
    for (const [label, field, unit] of [['настенно, мин', 'wall_min', ''], ['токены', 'total_tokens', ''], ['стоимость, $', 'cost_usd', ''], ['правок после QE', 'corrective_impl', '']]) {
      const a = p.A[field], b = p.B[field];
      const d = (a === null || b === null) ? null : Math.round((a - b) * 1000) / 1000;
      console.log(`| ${slug} | ${label} | ${show(a, unit)} | ${show(b, unit)} | ${show(d, unit)} |`);
    }
  }
  console.log('\nРазность считается только там, где ОБА значения измерены; «н/д» означает, что сравнивать нечего.');
}

const unpaired = [...pairs.entries()].filter(([, p]) => !(p.A && p.B));
if (unpaired.length) {
  console.log(`\n## Плечи без пары (${unpaired.length})\n`);
  for (const [key, p] of unpaired) console.log(`- ${key}: есть ${p.A ? 'A' : 'B'}, нет ${p.A ? 'B' : 'A'} — в парное сравнение не входит`);
}
if (problems.length) {
  console.log(`\n## Дефекты данных (${problems.length})\n`);
  for (const p of problems) console.log(`- ${p}`);
}
console.log('\n_Расход координатора и судьи в сравнение плеч не входит (предрегистрация §5)._');
process.exit(exitCode);
