// Сборка трёх проектов HyperFrames (build/16x9, build/1x1, build/9x16) из ОДНОГО исходника src/.
// Почему три каталога: lint/check требуют ровно один корневой index.html на проект
// (правило multiple_root_compositions), а render без -c тоже берёт index.html.
// Запускается ВНУТРИ образа promo-render (там /assets с записями и Onest в /usr/local/share/fonts).
// В каждый проект кладёт: index.html (CSS и JS вставлены в страницу), vendor/gsap.min.js
// из закреплённой npm-зависимости, fonts/Onest-*.ttf, media/<записи своего источника>.webm.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from "node:fs";

const ASSETS = process.env.ASSETS_DIR || "/assets";
const FONTS = process.env.FONTS_DIR || "/usr/local/share/fonts";

// Точки входа в записи (с): у desktop и mobile разный ход предпросмотра и прокрутка виджета.
const FORMATS = [
  { name: "16x9", w: 1920, h: 1080, src: "desktop", p1: 3, p2: 20, p3: 34.8, w1: 3 },
  { name: "1x1", w: 1080, h: 1080, src: "desktop", p1: 3, p2: 20, p3: 34.8, w1: 3 },
  { name: "9x16", w: 1080, h: 1920, src: "mobile", p1: 1.5, p2: 12, p3: 26, w1: 2.5 },
];
const CLIPS = ["preview", "chat", "widget"];
const WEIGHTS = ["Regular", "Medium", "SemiBold", "Bold"];

function need(path, what) {
  if (!existsSync(path)) {
    console.error(`❌ нет ${what}: ${path} — сборка НЕ выполнена`);
    process.exit(2);
  }
}
need("node_modules/gsap/dist/gsap.min.js", "GSAP (npm ci не выполнен?)");
for (const w of WEIGHTS) need(`${FONTS}/Onest-${w}.ttf`, "шрифт Onest");
for (const c of CLIPS) for (const s of ["desktop", "mobile"]) need(`${ASSETS}/${c}-${s}.webm`, "запись экрана");

const tpl = readFileSync("src/template.html", "utf8");
const css = readFileSync("src/scene.css", "utf8");
const js = readFileSync("src/scene.js", "utf8");

for (const f of FORMATS) {
  const dir = `build/${f.name}`;
  rmSync(dir, { recursive: true, force: true });
  for (const d of ["vendor", "fonts", "media"]) mkdirSync(`${dir}/${d}`, { recursive: true });
  copyFileSync("node_modules/gsap/dist/gsap.min.js", `${dir}/vendor/gsap.min.js`);
  for (const w of WEIGHTS) copyFileSync(`${FONTS}/Onest-${w}.ttf`, `${dir}/fonts/Onest-${w}.ttf`);
  for (const c of CLIPS) copyFileSync(`${ASSETS}/${c}-${f.src}.webm`, `${dir}/media/${c}-${f.src}.webm`);

  const html = tpl
    .replace('<link rel="stylesheet" href="src/scene.css" />', () => `<style>\n${css}</style>`)
    .replace('<script src="src/scene.js"></script>', () => `<script>\n${js}</script>`)
    .replaceAll("{{W}}", String(f.w)).replaceAll("{{H}}", String(f.h))
    .replaceAll("{{FORMAT}}", f.name).replaceAll("{{SRC}}", f.src)
    .replaceAll("{{P1}}", String(f.p1)).replaceAll("{{P2}}", String(f.p2))
    .replaceAll("{{P3}}", String(f.p3)).replaceAll("{{W1}}", String(f.w1));
  const left = html.match(/\{\{[A-Z0-9]+\}\}/);
  if (left) { console.error(`❌ не подставлено ${left[0]} в ${f.name}`); process.exit(1); }
  if (!html.includes("<style>") || !html.includes('window.__timelines["main"]')) {
    console.error(`❌ ${f.name}: CSS или таймлайн не вставлены в страницу`); process.exit(1);
  }
  writeFileSync(`${dir}/index.html`, html);
  console.log(`✓ ${dir}/index.html (${f.w}×${f.h}, записи ${f.src})`);
}
