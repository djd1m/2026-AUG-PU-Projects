#!/usr/bin/env node
'use strict';
/**
 * cost-from-usage.cjs — стоимость по прайс-листу из отчёта collect-usage.cjs и снимка тарифов.
 *   node scripts/telemetry/cost-from-usage.cjs <usage.json> <rates.json>
 * Формула протокола: (input − cached) × rate_input + cached × rate_cached + cache_write × rate_write
 * + output × rate_output, всё /1e6. Модель без тарифа → cost null с причиной, не ноль.
 * Это списочный эквивалент, не счёт: подписка и кредиты считаются иначе — см. note в rates.json.
 */
const fs = require('node:fs');
const [u, r] = process.argv.slice(2);
if (!u || !r) { console.error('usage: cost-from-usage.cjs <usage.json> <rates.json>'); process.exit(2); }
const usage = JSON.parse(fs.readFileSync(u, 'utf8')); const rates = JSON.parse(fs.readFileSync(r, 'utf8'));
const ttl = rates.assumptions && rates.assumptions.claude_cache_write_ttl && rates.assumptions.claude_cache_write_ttl.startsWith('5m') ? 'cache_write_5m' : 'cache_write_1h';
const out = { rates_snapshot: rates.snapshot_date, unit: {}, by_model: {}, total: {}, missing: [] };
for (const [model, m] of Object.entries(usage.by_model)) {
  const t = rates.models[model];
  if (!t) { out.missing.push(model); out.by_model[model] = { cost: null, reason: 'нет тарифа в снимке' }; continue; }
  const unit = rates.unit_per_million_tokens[t.provider];
  const cost = (m.input_tokens * t.input + m.cache_read_input_tokens * t.cache_read + (m.cache_creation_input_tokens || 0) * (t[ttl] || t.input) + m.output_tokens * t.output) / 1e6;
  out.by_model[model] = { cost: Number(cost.toFixed(4)), unit, requests: m.requests, cache_write_rate_used: t[ttl] ? ttl : 'input' };
  out.unit[unit] = (out.unit[unit] || 0) + cost;
}
for (const [k, v] of Object.entries(out.unit)) out.total[k] = Number(v.toFixed(2));
out.quality = 'list-price equivalent from host-written usage; ' + (out.missing.length ? 'partial: ' + out.missing.join(',') + ' without rate' : 'all models rated');
console.log(JSON.stringify(out, null, 2));
