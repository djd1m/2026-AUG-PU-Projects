#!/usr/bin/env node
'use strict';
/**
 * collect-usage.cjs — счётчики токенов для паспорта run.json из ТРАНСКРИПТОВ, а не из оценок.
 *
 *   node scripts/telemetry/collect-usage.cjs --session <claude-session-id> [--from ISO] [--to ISO]
 *        [--codex] [--codex-cwd <dir>] [--out <file.json>]
 *
 * Источники (host-written, не self-report модели):
 *   Claude Code — ~/.claude/projects/<slug>/<session>.jsonl и <session>/subagents/agent-*.jsonl:
 *     записи type=assistant несут message.model и message.usage. Стриминг пишет ОДНО сообщение
 *     несколькими строками (наблюдалось 328 строк → 116 уникальных message.id), поэтому счёт идёт
 *     по message.id: берётся ПОСЛЕДНЯЯ строка каждого id (итоговое состояние ответа). Один запрос
 *     считается один раз.
 *   Codex — ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl: event_msg/token_count несёт
 *     total_token_usage (КУМУЛЯТИВНО по сессии) — берётся последний снимок сессии, а не сумма
 *     снимков (сумма кумулятивных = двойной счёт). Модель — из turn_context.payload.model.
 *
 * Семантика (по протоколу feature-telemetry-v1): input_tokens_total ВКЛЮЧАЕТ cache_read и
 * cache_creation; output_tokens_total включает thinking. Детализация хранится рядом и не
 * прибавляется второй раз. Стоимость здесь НЕ считается — это делает rates.json + отдельный шаг.
 *
 * Чего файл НЕ делает: не читает биллинг провайдера, не знает лимитов подписки, не отличает
 * попытку от повтора (это делает events.jsonl). Пустой результат печатается как 0 запросов с
 * пометкой, а не как «расхода нет».
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const session = opt('--session'); if (!session) { console.error('нужен --session <id>'); process.exit(2); }
const from = opt('--from') ? Date.parse(opt('--from')) : -Infinity;
const to = opt('--to') ? Date.parse(opt('--to')) : Infinity;
const projectsDir = path.join(os.homedir(), '.claude', 'projects');

function findTranscript(id) {
  for (const slug of fs.readdirSync(projectsDir)) {
    const p = path.join(projectsDir, slug, id + '.jsonl');
    if (fs.existsSync(p)) return { main: p, subDir: path.join(projectsDir, slug, id, 'subagents') };
  }
  return null;
}

function readJsonl(file) {
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch (e) { out.push({ __bad: true }); }
  }
  return out;
}

const zero = () => ({ requests: 0, input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0, thinking_tokens: 0 });
function add(acc, u) {
  acc.requests += 1;
  acc.input_tokens += u.input_tokens || 0;
  acc.cache_creation_input_tokens += u.cache_creation_input_tokens || 0;
  acc.cache_read_input_tokens += u.cache_read_input_tokens || 0;
  acc.output_tokens += u.output_tokens || 0;
  acc.thinking_tokens += (u.output_tokens_details && u.output_tokens_details.thinking_tokens) || 0;
}

function collectClaude(file, agentLabel, stats) {
  const byId = new Map(); let raw = 0, bad = 0;
  for (const o of readJsonl(file)) {
    if (o.__bad) { bad++; continue; }
    if (o.type !== 'assistant' || !o.message || !o.message.usage) continue;
    const t = Date.parse(o.timestamp || 0);
    if (t < from || t > to) continue;
    raw++;
    byId.set(o.message.id || o.uuid, { model: o.message.model || 'unknown', usage: o.message.usage, t });
  }
  stats.raw_entries += raw; stats.bad_lines += bad;
  for (const v of byId.values()) {
    stats.by_model[v.model] = stats.by_model[v.model] || zero(); add(stats.by_model[v.model], v.usage);
    stats.by_agent[agentLabel] = stats.by_agent[agentLabel] || zero(); add(stats.by_agent[agentLabel], v.usage);
    if (v.t < stats.first_at) stats.first_at = v.t; if (v.t > stats.last_at) stats.last_at = v.t;
  }
}

const tr = findTranscript(session);
if (!tr) { console.error('транскрипт сессии не найден: ' + session); process.exit(2); }
const stats = { by_model: {}, by_agent: {}, raw_entries: 0, bad_lines: 0, first_at: Infinity, last_at: -Infinity };
collectClaude(tr.main, 'coordinator', stats);
if (fs.existsSync(tr.subDir)) for (const f of fs.readdirSync(tr.subDir)) {
  if (!f.endsWith('.jsonl')) continue;
  const m = /^agent-a?(.+?)-[0-9a-f]{16}\.jsonl$/.exec(f);
  collectClaude(path.join(tr.subDir, f), m ? m[1] : f, stats);
}

const totals = zero(); totals.requests = 0;
for (const v of Object.values(stats.by_model)) for (const k of Object.keys(totals)) totals[k] += v[k];
const normalized = {
  input_tokens_total: totals.input_tokens + totals.cache_creation_input_tokens + totals.cache_read_input_tokens,
  cached_input_tokens: totals.cache_read_input_tokens,
  cache_creation_input_tokens: totals.cache_creation_input_tokens,
  output_tokens_total: totals.output_tokens,
  reasoning_tokens: totals.thinking_tokens,
  requests: totals.requests
};

let codex = null;
if (has('--codex')) {
  const cwdFilter = opt('--codex-cwd');
  const root = path.join(os.homedir(), '.codex', 'sessions'); codex = { sessions: [], note: 'последний кумулятивный снимок total_token_usage на сессию; фильтр по времени старта' };
  const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d).flatMap((n) => { const p = path.join(d, n); return fs.statSync(p).isDirectory() ? walk(p) : (n.endsWith('.jsonl') ? [p] : []); }) : [];
  for (const f of walk(root)) {
    const rows = readJsonl(f); let meta = null, model = null, last = null;
    for (const o of rows) {
      if (o.__bad) continue;
      if (o.type === 'session_meta') meta = o.payload || {};
      if (o.type === 'turn_context' && o.payload && o.payload.model) model = o.payload.model;
      if (o.type === 'event_msg' && o.payload && o.payload.type === 'token_count' && o.payload.info) last = o.payload.info.total_token_usage || last;
    }
    if (!meta || !last) continue;
    const t = Date.parse(meta.timestamp || rows[0].timestamp || 0);
    if (t < from || t > to) continue;
    if (cwdFilter && meta.cwd && !String(meta.cwd).startsWith(cwdFilter)) continue;
    codex.sessions.push({ file: path.relative(root, f), started_at: new Date(t).toISOString(), cwd: meta.cwd || null, model: model, usage: last });
  }
}

const report = {
  source: 'transcript-aggregation (Claude Code host-written usage per response; Codex token_count snapshots)',
  quality: 'partial: реальные счётчики хоста, но не биллинг; попытки/повторы см. events.jsonl',
  session, window: { from: isFinite(from) ? new Date(from).toISOString() : null, to: isFinite(to) ? new Date(to).toISOString() : null },
  observed: { first_at: isFinite(stats.first_at) ? new Date(stats.first_at).toISOString() : null, last_at: isFinite(stats.last_at) ? new Date(stats.last_at).toISOString() : null },
  dedupe: { raw_assistant_entries: stats.raw_entries, unique_requests: totals.requests, bad_lines: stats.bad_lines },
  by_model: stats.by_model, by_agent: stats.by_agent, totals: normalized, codex,
  generated_at: new Date().toISOString()
};
const out = opt('--out');
if (out) { fs.writeFileSync(out, JSON.stringify(report, null, 2)); console.log('written ' + out); }
else console.log(JSON.stringify(report, null, 2));
