'use strict';
/* Сборка САМОДОСТАТОЧНЫХ файлов: index.html и variant-a..d.html.
   Владелец скачивает один файл с GitHub и открывает двойным кликом — стили, скрипты и шрифты
   вшиты внутрь (CSS, JS, base64-шрифты). Источники правок — assets/*, сюда руками не писать. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = function (p) { return fs.readFileSync(path.join(root, p), 'utf8'); };

function inlineFonts(css) {
  return css.replace(/url\('fonts\/([^']+)'\)/g, function (_, file) {
    const b64 = fs.readFileSync(path.join(root, 'assets', 'fonts', file)).toString('base64');
    return "url('data:font/ttf;base64," + b64 + "')";
  });
}

let html = read('assets/index.template.html');
const css = inlineFonts(read('assets/styles.css')) + '\n' + read('assets/phone.css');
html = html.replace(/<link rel="stylesheet" href="assets\/styles.css">\s*<link rel="stylesheet" href="assets\/phone.css">/,
  '<style>\n' + css + '\n</style>');
const scripts = ['data.js', 'food.js', 'screens.js', 'app.js'].map(function (f) { return read('assets/' + f); });
html = html.replace(/<script src="assets\/data.js"><\/script>\s*<script src="assets\/food.js"><\/script>\s*<script src="assets\/screens.js"><\/script>\s*<script src="assets\/app.js"><\/script>/,
  function () { return '<script>\n' + scripts.join('\n') + '\n</script>'; });
if (/(src|href)="assets\/|url\('fonts\//.test(html)) throw new Error('в сборке остались внешние ссылки на assets/');

const stamp = '<!-- Самодостаточная сборка: tests/bundle.cjs · источники в assets/ · ' + new Date().toISOString().slice(0, 10) + ' -->\n';
fs.writeFileSync(path.join(root, 'index.html'), stamp + html);
['A', 'B', 'C', 'D'].forEach(function (v) {
  const pre = '<script>if(!/^#[ABCD]\\/[1-6]$/.test(location.hash))location.replace("#' + v + '/1");</script>\n';
  const out = html.replace('<script>\n' + scripts[0], pre + '<script>\n' + scripts[0]);
  fs.writeFileSync(path.join(root, 'variant-' + v.toLowerCase() + '.html'), stamp + out);
});
console.log('bundled: index.html ' + fs.statSync(path.join(root, 'index.html')).size + ' bytes, variant-a..d.html');
