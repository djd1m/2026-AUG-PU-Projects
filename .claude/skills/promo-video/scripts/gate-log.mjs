// Ворота журнала событий записи (модуль 03 п. 5): монтаж берёт from/to из журнала, значит журнал обязан давать время
// ВНУТРИ файла, а не только часы прогона.
//   node .claude/skills/promo-video/scripts/gate-log.mjs <record-log-*.json> [каталог записей]
// Требования: у каждого файла записи есть событие `video.start` {file, layout, t_s} и `video.saved` {file, ok};
// каждое событие с полем `file` (кроме start/saved) несёт `t_file_s` = t_s − t_s(video.start того же файла) ± 0,2 с
// и лежит внутри [start, saved]; файл из журнала существует в каталоге записей (если он передан).
// 1.2 (сквозной прогон N3, замечания 5 и 9):
//  - с каталогом записей — длительность КАЖДОГО файла по ffprobe (хост или образ promo-render): последнее событие файла
//    не позже конца файла + 0,05 с. У N3 desktop `end` t_file_s 68,89 при файле 68,56 с — часы журнала впереди файла
//    ≥ 0,33 с, прежние ворота давали 0, а gate-config.sh потом 1 («to за концом файла»). Печатается смещение.
//  - `api.demo_sessions` (если журнал его ведёт) ≤ числа сохранённых файлов: один демосеанс на раскладку; в
//    `api.non_2xx` не больше одного 429 — после первого отказа скрипт обязан остановиться.
// Коды: 0 — журнал пригоден для монтажа · 1 — дефект назван · 2 — проверка НЕ выполнена (нет файла, не JSON, нет events,
//       длительность файла не измерена).
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const [logPath, recDir] = process.argv.slice(2);
const fail2 = (m) => { console.error(`❌ ${m} — проверка НЕ выполнена`); process.exit(2); };
if (!logPath || !existsSync(logPath)) fail2(`нет журнала «${logPath ?? ''}»`);
let log;
try { log = JSON.parse(readFileSync(logPath, 'utf8')); } catch (e) { fail2(`журнал не JSON: ${e.message}`); }
if (!Array.isArray(log.events) || log.events.length === 0) fail2('в журнале нет events');
let bad = 0;
const defect = (m) => { console.log(`❌ ${m}`); bad = 1; };
const starts = new Map(); const saved = new Map();
for (const e of log.events) {
  if (e.event === 'video.start') { if (!e.file || !e.layout || typeof e.t_s !== 'number') defect(`video.start без file/layout/t_s: ${JSON.stringify(e)}`); else starts.set(e.file, e); }
  if (e.event === 'video.saved' && e.file) saved.set(e.file, e);
}
if (saved.size === 0) defect('нет ни одного video.saved — записей нет');
for (const [file, s] of saved) {
  if (!starts.has(file)) defect(`${file}: нет video.start — начало файла не привязано к часам прогона, from/to не вычислить`);
  if (s.ok === false) defect(`${file}: video.saved ok=false`);
  if (recDir && !existsSync(path.join(recDir, file))) defect(`${file}: нет в ${recDir}`);
}
for (const e of log.events) {
  if (!e.file || e.event === 'video.start' || e.event === 'video.saved') continue;
  const s = starts.get(e.file);
  if (!s) continue; // уже названо выше
  if (typeof e.t_file_s !== 'number') { defect(`${e.event} (${e.file}, t_s=${e.t_s}): нет t_file_s`); continue; }
  if (Math.abs(e.t_s - s.t_s - e.t_file_s) > 0.2) defect(`${e.event} (${e.file}): t_file_s=${e.t_file_s}, а t_s − start = ${(e.t_s - s.t_s).toFixed(1)}`);
  const end = saved.get(e.file)?.t_s ?? Infinity;
  if (e.t_s < s.t_s || e.t_s > end) defect(`${e.event} (${e.file}): t_s=${e.t_s} вне записи файла [${s.t_s}; ${end}]`);
}
const tagged = log.events.filter((e) => e.file && e.event !== 'video.start' && e.event !== 'video.saved').length;
if (tagged === 0) defect('ни одно событие действия не привязано к файлу (поле file) — монтажу не из чего брать from/to');
// Демосеансы: один на раскладку, остановка на первом 429.
const api = log.api;
if (api && typeof api.demo_sessions === 'number') {
  if (api.demo_sessions > saved.size) defect(`api.demo_sessions=${api.demo_sessions} при ${saved.size} файлах — больше одного демосеанса на раскладку`);
  const r429 = (api.non_2xx ?? []).filter((x) => x.status === 429).length;
  if (r429 > 1) defect(`в api.non_2xx ${r429} ответов 429 — после первого отказа скрипт продолжал`);
  console.log(`ℹ️ демосеансов ${api.demo_sessions}, команд API ${api.commands ?? '?'}, не-2xx ${(api.non_2xx ?? []).length}`);
} else console.log('ℹ️ журнал не ведёт api.demo_sessions — если у продукта есть демосеансы, их расход не учтён (модуль 03 п. 6а)');
// Длительность файла против последнего события (только с каталогом записей).
function duration(dir, file) {
  const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0'];
  let r = spawnSync('ffprobe', [...args, path.join(dir, file)], { encoding: 'utf8' });
  if (r.error) {
    const proj = path.basename(path.resolve(dir)).replace(/[^a-z0-9-]/g, '') || 'x';
    r = spawnSync('docker', ['run', '--rm', '--name', `promo-${proj}-logprobe-${process.pid}`, '--network', 'none', '--cpus=1', '--memory=512m',
      '-v', `${path.resolve(dir)}:/a:ro`, 'promo-render:2026-09-29', 'ffprobe', ...args, `/a/${file}`], { encoding: 'utf8' });
  }
  const d = parseFloat((r.stdout ?? '').trim());
  return r.status === 0 && Number.isFinite(d) ? d : null;
}
if (recDir) for (const file of saved.keys()) {
  if (!existsSync(path.join(recDir, file))) continue; // уже названо выше
  const d = duration(recDir, file);
  if (d === null) fail2(`${file}: длительность не измерена (нет ffprobe на хосте и образа promo-render)`);
  const last = Math.max(...log.events.filter((e) => e.file === file && typeof e.t_file_s === 'number').map((e) => e.t_file_s));
  if (!Number.isFinite(last)) continue;
  const lead = last - d;
  if (lead > 0.05) defect(`${file}: последнее событие t_file_s=${last} за концом файла ${d.toFixed(2)} с — часы журнала впереди файла ≥ ${lead.toFixed(2)} с; from/to сдвигать на −${lead.toFixed(2)} (записать в README) или исправить video.start`);
  else console.log(`ℹ️ ${file}: ${d.toFixed(2)} с, последнее событие ${last} с (${lead > 0 ? `впереди на ${lead.toFixed(2)} с — в допуске 0,05 с` : `запас ${(-lead).toFixed(2)} с`})`);
}
console.log(bad ? '❌ журнал записи: ДЕФЕКТ' : `✅ журнал записи: ${saved.size} файлов, ${tagged} событий с t_file_s`);
process.exit(bad);
