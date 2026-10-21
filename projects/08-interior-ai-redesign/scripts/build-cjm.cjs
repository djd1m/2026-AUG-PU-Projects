'use strict';
const fs=require('fs');
const path=require('path');
const project=path.resolve(__dirname,'..');
const discovery=path.join(project,'docs','discovery');
const src=path.join(discovery,'src');
const css=fs.readFileSync(path.join(src,'prototype.css'),'utf8').trim();
const js=fs.readFileSync(path.join(src,'prototype.js'),'utf8').trim();
const variants=require(path.join(src,'variants.js'));
function shell(cfg){return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${cfg.letter} · ${cfg.name} — CJM N8</title>
<style>
${css}
</style>
</head>
<body>
<div class="demo-banner">Интерактивный прототип · данные и действия демонстрационные</div>
<header class="mast">
 <div class="brand">Контур дома<small>CJM для ремонта собственной квартиры</small></div>
 <div class="variant-mark"><b>${cfg.letter}</b><span>${cfg.name} · ${cfg.letter==='A'?'выбранный путь':'вариант для сравнения'}</span></div>
</header>
<main class="layout">
 <nav class="rail" aria-label="Этапы пути"><p class="rail-title">Маршрут S0–S9</p><div id="steps"></div><p class="rail-note">Можно изучать любой экран. Просмотр не обходит проверки и не означает завершение этапа.</p></nav>
 <article class="sheet">
  <header class="stage-head"><p class="kicker" id="stageName"></p><span class="demo-chip">локальный demo</span></header>
  <section class="screen" id="screen" aria-live="polite"></section>
  <div class="live" id="live" role="status" aria-live="polite"></div>
  <footer class="footer-nav"><button class="action ghost" id="back">← Назад</button><button class="action primary" id="next">Следующий этап →</button></footer>
 </article>
</main>
<script>const CFG=${JSON.stringify(cfg)};</script>
<script>
${js}
</script>
</body>
</html>
`}
for(const [key,cfg] of Object.entries(variants))fs.writeFileSync(path.join(discovery,`cjm-${key.toLowerCase()}.html`),shell(cfg));
const cards=Object.values(variants).map(v=>`<a class="card c${v.letter}" href="cjm-${v.letter.toLowerCase()}.html"><span>${v.letter}</span><h2>${v.name}</h2><p>${v.promise}</p><b>Открыть путь →</b></a>`).join('\n');
const index=`<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Три CJM · Контур дома</title>
<style>
:root{--paper:#f1ece2;--ink:#282720;--line:#cfc4b2}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 'Trebuchet MS',sans-serif}
main{max-width:1260px;margin:auto;padding:7vw 32px}
header{max-width:870px;margin-bottom:55px}
small{letter-spacing:.16em;text-transform:uppercase}
h1,h2{font-family:Georgia,serif;font-weight:500}
h1{font-size:clamp(3rem,8vw,7.5rem);line-height:.88;letter-spacing:-.055em;margin:18px 0 30px}
header p{font:21px/1.45 Georgia,serif}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.card{min-height:330px;padding:28px;border:1px solid var(--line);background:#fffdf8;color:inherit;text-decoration:none;display:flex;flex-direction:column;transition:.2s transform,.2s box-shadow}
.card:hover{transform:translateY(-6px);box-shadow:0 20px 50px #493f2d22}
.card span{font:70px/1 Georgia,serif}.card h2{font-size:32px}.card p{color:#69655c}.card b{margin-top:auto}
.cA span{color:#9b4b32}.cB span{color:#7c5332}.cC span{color:#3f6357}
.note{margin-top:30px;border-left:3px solid #9b4b32;padding:10px 18px;color:#69655c}
@media(max-width:760px){main{padding:40px 18px}.grid{grid-template-columns:1fr}.card{min-height:240px}}
</style></head>
<body><main>
<header><small>Выбор Customer Journey Map · N8</small><h1>Один ремонт.<br>Три ритма.</h1><p>Во всех вариантах сохраняется канон: обмеры и референсы → визуализация → согласованный дизайн → конкретные товары → бюджет → пересмотр.</p></header>
<section class="grid">
${cards}
</section>
<p class="note">Интерактивные прототипы. Все данные и действия демонстрационные. Владелец выбрал A — ближайший к исходному CJM. B/C сохранены для сравнения. Реализация продолжается без ожидания approval.</p>
</main></body></html>`;
fs.writeFileSync(path.join(discovery,'index.html'),index);
console.log('Built cjm-a.html, cjm-b.html, cjm-c.html, index.html');
