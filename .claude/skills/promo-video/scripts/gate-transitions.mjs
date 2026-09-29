// Опасные переходы записи — ПОКАДРОВО (модуль 02 п. 5а, модуль 04 п. 4а). 1.2 — сквозной прогон N3, замечание 1 +
// уточнение Codex: зоны, объявленные по событию перехода (`invite.open`), дали gate-config.sh → 0, а в готовом 9:16
// остались служебные полосы стенда: mobile-запись прокручивается к верху ДО события; вспышка 24,76–24,84 с записи
// (2 кадра при 25 fps) видна только покадрово — шаг 0,1 с её пропускает. Зелёный gate-config доказывает исключение
// только ОБЪЯВЛЕННЫХ зон; этот страж проверяет, что у объявления нет дыр на стыках.
//   node gate-transitions.mjs make  <proj> <config-inspect.tsv> <каталог записей> <каталог листов> [forbidden-zones.tsv]
//   node gate-transitions.mjs check <proj> <каталог записей> <каталог листов>
// make: окно перехода = [предыдущее событие файла; событие перехода + 0,5 с], переход — событие `*.open`, `scroll.top`,
//   `*.scroll_top` журнала record-log-*.json. Кусок (VISIBLE) задевает окно ±0,5 с → лист КАЖДОГО кадра этой части
//   куска (frames.sh all, ≤ 4 с на лист). Если у файла есть запретные зоны — только куски, чьё видимое окно по x/y
//   пересекает хоть одну зону (иначе полосу не видно по построению). Пишет index.tsv и verdict.tsv (исход «?»; исход
//   переносится, если лист того же интервала снят с записи того же sha256).
// check: исход каждого листа `чисто` · `полоса` · `другое:<что>` + sha256 записи = текущей.
// Коды make: 0 — листы сделаны (или опасных стыков нет — сказано) · 2 — НЕ выполнено (нет входа, журнала, frames.sh упал).
// Коды check: 0 — все листы `чисто` · 1 — полоса/другое или лист с другой записи · 2 — «?», значение не из списка, нет файлов.
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const [mode, proj, ...rest] = process.argv.slice(2);
const fail2 = (m) => { console.error(`❌ ${m} — НЕ выполнено`); process.exit(2); };
if (!['make', 'check'].includes(mode) || !/^[a-z0-9-]+$/.test(proj ?? '')) fail2('usage: make|check <proj> …');
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const tsv = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'));
const NAV = /(\.open|(^|\.)scroll[._]top)$/;
const PAD = 0.5, CHUNK = 4;

if (mode === 'make') {
  const [inspect, recDir, outDir, zonesF] = rest;
  if (!inspect || !existsSync(inspect)) fail2(`нет config-inspect.tsv «${inspect ?? ''}» (gate-config.sh)`);
  if (!recDir || !existsSync(recDir)) fail2(`нет каталога записей «${recDir ?? ''}»`);
  if (!outDir) fail2('не задан каталог листов');
  const logs = readdirSync(recDir).filter((f) => /^record-log-.*\.json$/.test(f));
  if (logs.length === 0) fail2(`в ${recDir} нет record-log-*.json`);
  const events = new Map(); // file -> [{t, event}]
  for (const l of logs) {
    let j; try { j = JSON.parse(readFileSync(path.join(recDir, l), 'utf8')); } catch { fail2(`${l} не JSON`); }
    for (const e of j.events ?? []) if (e.file && typeof e.t_file_s === 'number') {
      if (!events.has(e.file)) events.set(e.file, []);
      events.get(e.file).push({ t: e.t_file_s, event: e.event });
    }
  }
  const windows = new Map();
  for (const [file, ev] of events) {
    ev.sort((a, b) => a.t - b.t);
    windows.set(file, ev.map((e, i) => NAV.test(e.event) ? { w0: i ? ev[i - 1].t : 0, w1: e.t + PAD, why: `${i ? ev[i - 1].event : 'начало'} → ${e.event}` } : null).filter(Boolean));
  }
  const zones = new Map();
  if (zonesF) { if (!existsSync(zonesF)) fail2(`нет ${zonesF}`);
    for (const z of tsv(zonesF)) { if (z.length < 8) fail2(`зона не из 8 полей: ${z.join(' ')}`);
      if (!zones.has(z[0])) zones.set(z[0], []); zones.get(z[0]).push(z.slice(1, 5).map(Number)); } }
  const jobs = new Map();
  for (const r of tsv(inspect).filter((r) => r[0] === 'VISIBLE')) {
    const [, kind, , file, iv, xs, ys] = r;
    const [a, b] = iv.split('-').map(Number);
    const [x0, x1] = xs.replace(/^x /, '').split('–').map(Number); const [y0, y1] = ys.replace(/^y /, '').split('–').map(Number);
    const zs = zones.get(file);
    if (zs && !zs.some(([zx0, zy0, zx1, zy1]) => x0 < zx1 && zx0 < x1 && y0 < zy1 && zy0 < y1)) continue;
    if (!events.has(file)) fail2(`${file} (кусок ${kind} ${iv}) нет в журналах — окна переходов не вычислить`);
    for (const w of windows.get(file)) {
      const from = Math.max(a, w.w0 - PAD), to = Math.min(b, w.w1 + PAD);
      for (let s = from; s < to - 0.01; s += CHUNK) {
        const e = Math.min(to, s + CHUNK), k = `${file}\t${s.toFixed(2)}\t${e.toFixed(2)}`;
        const prev = jobs.get(k); jobs.set(k, `${prev ? prev + '; ' : ''}${kind} ${iv}: ${w.why}`);
      }
    }
  }
  mkdirSync(outDir, { recursive: true });
  const oldV = new Map();
  if (existsSync(path.join(outDir, 'verdict.tsv'))) for (const r of tsv(path.join(outDir, 'verdict.tsv'))) oldV.set(r[0], r);
  const index = ['лист\tзапись\tfrom\tto\tпочему\tsha256_записи'], verdict = ['# лист\tисход (чисто|полоса|другое:<что>)\tsha256_записи\tчто видно'];
  let kept = 0;
  for (const [k, why] of jobs) {
    const [file, from, to] = k.split('\t');
    const sheet = `tr-${file.replace(/\.[^.]+$/, '')}-${from}-${to}.png`;
    const r = spawnSync('bash', [path.join(path.dirname(new URL(import.meta.url).pathname), 'frames.sh'), proj, path.join(recDir, file), from, to, path.join(outDir, sheet), 'all'], { encoding: 'utf8' });
    if (r.status !== 0) fail2(`frames.sh ${file} ${from}-${to}: код ${r.status} ${r.stdout}${r.stderr}`);
    const h = sha(path.join(recDir, file));
    index.push(`${sheet}\t${file}\t${from}\t${to}\t${why}\t${h}`);
    const o = oldV.get(sheet);
    if (o && o[2] === h && o[1] && o[1] !== '?') { verdict.push(o.join('\t')); kept++; } else verdict.push(`${sheet}\t?\t${h}\t`);
  }
  writeFileSync(path.join(outDir, 'index.tsv'), index.join('\n') + '\n');
  writeFileSync(path.join(outDir, 'verdict.tsv'), verdict.join('\n') + '\n');
  console.log(jobs.size ? `✅ опасных стыков ${jobs.size}: листы каждого кадра в ${outDir}; перенесено исходов ${kept}; заполнить «?» в verdict.tsv, затем check`
    : `✅ ни один видимый кусок не задевает окно перехода — покадровых листов не нужно (index.tsv пуст)`);
  process.exit(0);
}

// check
const [recDir, outDir] = rest;
for (const f of ['index.tsv', 'verdict.tsv']) if (!outDir || !existsSync(path.join(outDir, f))) fail2(`нет ${outDir ?? ''}/${f} (сначала make)`);
if (!recDir || !existsSync(recDir)) fail2(`нет каталога записей «${recDir ?? ''}»`);
const idx = tsv(path.join(outDir, 'index.tsv')).slice(1);
const ver = new Map(tsv(path.join(outDir, 'verdict.tsv')).map((r) => [r[0], r]));
let bad = 0, undone = 0; const cur = new Map();
for (const [sheet, file, from, to, , h] of idx) {
  if (!cur.has(file)) { const p = path.join(recDir, file); if (!existsSync(p)) fail2(`нет записи ${p}`); cur.set(file, sha(p)); }
  if (!existsSync(path.join(outDir, sheet))) { console.error(`❌ ${sheet}: файла листа нет`); undone = 1; continue; }
  const v = ver.get(sheet); const out = v?.[1] ?? '';
  if (h !== cur.get(file)) { console.log(`❌ ${sheet}: снят с записи ${h.slice(0, 12)}…, текущая ${cur.get(file).slice(0, 12)}… — пересобрать (make)`); bad = 1; continue; }
  if (v?.[2] !== h) { console.log(`❌ ${sheet}: исход вынесен по другой записи — просмотреть заново`); bad = 1; continue; }
  if (out === 'чисто') continue;
  if (out === 'полоса' || /^другое:.+/.test(out)) { console.log(`❌ ${sheet} (${file} ${from}–${to} с): ${out} ${v[3] ?? ''} — расширить зону до этих кадров, gate-config.sh → 1 → сдвинуть кусок`); bad = 1; continue; }
  console.error(`❌ ${sheet}: исход «${out}» — лист не просмотрен или значение не из списка`); undone = 1;
}
if (bad) { console.log('❌ переходы: ОТКАЗ'); process.exit(1); }
if (undone) { console.error('❌ переходы: проверка НЕ выполнена полностью'); process.exit(2); }
console.log(`✅ опасных стыков ${idx.length}: каждый кадр просмотрен, служебных полос нет; листы сняты с текущих записей`);
