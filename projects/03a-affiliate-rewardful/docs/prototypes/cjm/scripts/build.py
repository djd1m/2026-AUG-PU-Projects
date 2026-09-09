"""Build standalone offline HTML prototypes; no product backend or PRD generation."""
from pathlib import Path
import base64

root = Path(__file__).resolve().parents[1]
assets = root / 'assets'
font_css = ''
for name, weight in [('rubik-regular.ttf', 400), ('rubik-bold.ttf', 700)]:
    font = assets / name
    encoded = base64.b64encode(font.read_bytes()).decode()
    font_css += "@font-face{font-family:Rubik;font-style:normal;font-weight:" + str(weight)
    font_css += ";font-display:swap;src:url(data:font/ttf;base64," + encoded + ") format('truetype')}\n"
template = (assets / 'shell.html').read_text()
template = template.replace('/*STYLE*/', font_css + (assets / 'style.css').read_text())
template = template.replace('/*DATA*/', (assets / 'data.js').read_text())
template = template.replace('/*APP*/', (assets / 'app.js').read_text())
for name, start in [('index.html', 'A'), ('variant-a.html', 'A'), ('variant-b.html', 'B'), ('variant-c.html', 'C')]:
    html = template.replace('__START__', start)
    assert len(html.splitlines()) < 500
    (root / name).write_text(html)
    print(f'{name}: {len(html.encode())} bytes, {len(html.splitlines())} lines')
