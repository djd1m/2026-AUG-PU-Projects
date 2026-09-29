// Предполётная проверка конфига ролика ДО рендера. Выполняется ВНУТРИ promo-render (зовёт gate-config.sh):
//   node /s/inspect-config.mjs <proj>      (/work = promo/remotion, /assets = записи проекта, только чтение)
// Проверяет то, чего не проверяет validateProject шаблона (ограничения №1–3 модуля 04):
//   1. титры: каждая строка после переноса по 45 знаков — не больше двух строк (константы уже разрешены импортом);
//   2. сегменты: файл есть, ffprobe-размер = size, длительность файла ≥ to, 0 ≤ from < to;
//   3. видимая область: для каждого куска и формата — окно ИСХОДНОЙ записи, которое реально видно (формула place()
//      из shared/src/Promo.tsx); пересечение с зонами из <proj>/forbidden-zones.tsv — дефект;
//   4. стыки: секунды готового ролика, где начинается сцена или кусок (для покадровой раскадровки).
// Коды: 0 — дефектов нет · 1 — дефект доказан и назван · 2 — проверка НЕ выполнена (нет конфига, записи не читаются).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const proj = process.argv[2] ?? '';
const fail2 = (m) => { console.error(`❌ ${m} — проверка НЕ выполнена`); process.exit(2); };
if (!/^[a-z0-9-]+$/.test(proj) || !existsSync(`/work/${proj}/project.config.ts`)) fail2(`нет /work/${proj}/project.config.ts`);
let cfg;
try { cfg = (await import(`/work/${proj}/project.config.ts`)).default; } catch (e) { fail2(`конфиг не импортируется: ${e.message}`); }
if (!cfg || !Array.isArray(cfg.scenes)) fail2('в конфиге нет scenes');

const FPS = 30;
const FORMATS = { wide: [1920, 1080, 0.18], tall: [1080, 1920, 0.15], square: [1080, 1080, 0.3] };
const LINE = 45;
let bad = 0;
const defect = (m) => { console.log(`❌ ${m}`); bad = 1; };

// 1. Титры: жадный перенос по словам на LINE знаков (оценка сверху для 9:16 и 1:1; фактический перенос — раскадровка).
const lines = (t) => { const out = []; let cur = ''; for (const w of String(t).split(/\s+/).filter(Boolean)) { if (cur && (cur + ' ' + w).length > LINE) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; } if (cur) out.push(cur); return out; };
const texts = new Map(); // текст → вид: screen (титр над записью — нужен кадр-доказательство) | title | tagline
for (const sc of cfg.scenes) {
  if (sc.type === 'title') for (const l of sc.lines ?? []) texts.set(l.text, texts.get(l.text) ?? 'title');
  if (sc.type === 'screen') for (const tr of Object.values(sc.tracks)) for (const s of tr.segments) texts.set(s.caption, 'screen');
}
if (!texts.has(cfg.tagline)) texts.set(cfg.tagline, 'tagline');
for (const [t, kind] of texts) {
  const n = lines(t).length;
  console.log(`CAPTION\t${kind}\t${[...String(t)].length}\t${n}\t${t}`);
  if (n > 2) defect(`титр «${t}»: ${n} строки при переносе по ${LINE} знаков`);
}

// 2. Сегменты по ffprobe.
const probe = new Map();
const probeFile = (file) => {
  if (probe.has(file)) return probe.get(file);
  const p = `/assets/${file}`;
  let r = null;
  if (existsSync(p)) {
    try {
      const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'default=noprint_wrappers=1', p], { encoding: 'utf8' });
      const g = (k) => Number((out.match(new RegExp(`^${k}=(.+)$`, 'm')) ?? [])[1]);
      r = { w: g('width'), h: g('height'), d: g('duration') };
      if (![r.w, r.h, r.d].every(Number.isFinite)) fail2(`ffprobe не дал размер/длительность ${file}`);
    } catch (e) { fail2(`ffprobe не прочитал ${file}: ${String(e.message).slice(0, 120)}`); }
  }
  probe.set(file, r);
  return r;
};

// 3. Видимая область — точная копия place() и geometry() шаблона.
const place = ([sw, sh], W, H, c) => {
  c = c ?? { x: 0, y: 0, w: sw, h: sh };
  const s = Math.min(W / c.w, H / c.h);
  const axis = (area, rendered, center) => (rendered <= area ? (area - rendered) / 2 : Math.min(0, Math.max(area - rendered, area / 2 - center * s)));
  return { s, left: axis(W, sw * s, c.x + c.w / 2), top: axis(H, sh * s, c.y + c.h / 2) };
};
const visible = (size, fmt, crop) => {
  const [W, Hf, share] = FORMATS[fmt];
  const H = Hf - Math.round(Hf * share);
  const { s, left, top } = place(size, W, H, crop);
  const cl = (v, m) => Math.max(0, Math.min(m, v));
  return { x0: cl(-left / s, size[0]), x1: cl((W - left) / s, size[0]), y0: cl(-top / s, size[1]), y1: cl((H - top) / s, size[1]) };
};
const zonesPath = existsSync('/zones.tsv') ? '/zones.tsv' : `/work/${proj}/forbidden-zones.tsv`;
const zones = existsSync(zonesPath)
  ? readFileSync(zonesPath, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l, i) => {
      const [file, x0, y0, x1, y1, from, to, ...why] = l.split('\t');
      const z = { file, x0: +x0, y0: +y0, x1: +x1, y1: +y1, from: +from, to: +to, why: why.join(' ') };
      if (![z.x0, z.y0, z.x1, z.y1, z.from, z.to].every(Number.isFinite)) fail2(`${zonesPath}:${i + 1} — ожидалось file x0 y0 x1 y1 from to причина (TAB)`);
      return z;
    })
  : [];
console.log(`ZONES\t${zones.length}\t${existsSync(zonesPath) ? zonesPath : 'нет файла forbidden-zones.tsv'}`);

let at = 0; // кадры готового ролика
for (const [i, sc] of cfg.scenes.entries()) {
  const frames = Math.round(sc.seconds * FPS);
  for (const fmt of Object.keys(FORMATS)) console.log(`BOUNDARY\t${fmt}\t${(at / FPS).toFixed(3)}\tсцена ${i + 1} (${sc.type})`);
  if (sc.type === 'screen') {
    for (const fmt of Object.keys(FORMATS)) {
      const use = sc.use[fmt];
      const tr = sc.tracks[use.track];
      const info = probeFile(tr.file);
      if (!info) { defect(`сцена ${i + 1} ${fmt}: файла /assets/${tr.file} нет`); continue; }
      if (info.w !== tr.size[0] || info.h !== tr.size[1]) defect(`${tr.file}: ffprobe ${info.w}×${info.h}, в конфиге size ${tr.size.join('×')}`);
      let segAt = at;
      for (const [k, s] of tr.segments.entries()) {
        if (k > 0) console.log(`BOUNDARY\t${fmt}\t${(segAt / FPS).toFixed(3)}\tсцена ${i + 1} кусок ${k + 1}`);
        if (!(s.from >= 0 && s.to > s.from)) defect(`${tr.file} кусок ${k + 1}: from=${s.from} to=${s.to}`);
        if (s.to > info.d) defect(`${tr.file} кусок ${k + 1}: to=${s.to} с, а файл длится ${info.d.toFixed(3)} с`);
        const v = visible(tr.size, fmt, s.crop?.[fmt] ?? use.crop);
        const t0 = (segAt / FPS).toFixed(2), t1 = ((segAt + Math.round(s.seconds * FPS)) / FPS).toFixed(2);
        console.log(`VISIBLE\t${fmt}\t${t0}-${t1}\t${tr.file}\t${s.from}-${s.to}\tx ${v.x0.toFixed(0)}–${v.x1.toFixed(0)}\ty ${v.y0.toFixed(0)}–${v.y1.toFixed(0)}`);
        for (const z of zones) {
          if (z.file !== tr.file || z.to <= s.from || z.from >= s.to) continue;
          if (v.x0 < z.x1 && z.x0 < v.x1 && v.y0 < z.y1 && z.y0 < v.y1)
            defect(`${fmt} ${t0}-${t1} с: видимое окно ${tr.file} x ${v.x0.toFixed(0)}–${v.x1.toFixed(0)} y ${v.y0.toFixed(0)}–${v.y1.toFixed(0)} задевает запретную зону «${z.why}» (${z.x0},${z.y0})–(${z.x1},${z.y1})`);
        }
        segAt += Math.round(s.seconds * FPS);
      }
    }
  }
  at += frames;
}
console.log(`TOTAL\t${(at / FPS).toFixed(3)} с`);
if (at !== 45 * FPS) defect(`сумма сцен ${(at / FPS).toFixed(3)} с, нужно 45`);
console.log(bad ? '❌ предполётная проверка: ДЕФЕКТ' : '✅ предполётная проверка: титры, сегменты, видимые окна и зоны в порядке');
process.exit(bad);
