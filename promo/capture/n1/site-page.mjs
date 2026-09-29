// Сайт клиента для сцены 4: вымышленная кофейня, сниппет вставлен одной строкой перед </section>.
export function sitePage(code) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Кофейня «Пример»</title><style>
*{box-sizing:border-box}body{margin:0;font-family:Georgia,'Times New Roman',serif;background:#f6efe6;color:#2b1d14}
header{display:flex;align-items:center;justify-content:space-between;padding:22px 6vw;background:#2b1d14;color:#f6efe6}
header b{font-size:24px;letter-spacing:.5px}nav a{color:#e9d5bd;margin-left:26px;text-decoration:none;font-family:system-ui,sans-serif;font-size:15px}
.hero{padding:9vh 6vw 7vh;display:grid;gap:18px;max-width:1100px}.hero h1{font-size:clamp(34px,5vw,64px);margin:0;line-height:1.05}
.hero p{font:18px/1.5 system-ui,sans-serif;max-width:560px;margin:0;color:#5b4636}
.cta{display:inline-block;margin-top:8px;padding:14px 22px;background:#b5522b;color:#fff;border-radius:999px;font:600 16px system-ui,sans-serif;text-decoration:none;width:max-content}
.menu{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;padding:0 6vw 7vh;max-width:1200px}
.menu div{background:#fff8ef;border:1px solid #e6d6c3;border-radius:14px;padding:18px;font:15px/1.4 system-ui,sans-serif}.menu b{display:block;font:600 18px Georgia,serif;margin-bottom:6px}
.reviews{padding:5vh 6vw 10vh;background:#fffaf4;border-top:1px solid #e6d6c3}.reviews h2{font-size:clamp(26px,3.4vw,40px);margin:0 0 22px}
footer{padding:28px 6vw;font:14px system-ui,sans-serif;color:#8a7461}
</style></head><body>
<header><b>Кофейня «Пример»</b><nav><a href="#">Меню</a><a href="#">Зерно</a><a href="#">Контакты</a></nav></header>
<section class="hero"><h1>Свежая обжарка<br>каждое утро</h1><p>Небольшая кофейня у дома: зерно своей обжарки, выпечка и тихий зал для работы.</p><a class="cta" href="#">Заказать зерно</a></section>
<section class="menu"><div><b>Капучино</b>двойной эспрессо и молоко</div><div><b>Фильтр дня</b>зерно недели, воронка</div><div><b>Круассан</b>из печи в 8:00</div></section>
<section class="reviews" id="reviews"><h2>Что говорят гости</h2>
${code}
</section>
<footer>Вымышленный сайт для демонстрации виджета · пример</footer>
</body></html>`;
}
