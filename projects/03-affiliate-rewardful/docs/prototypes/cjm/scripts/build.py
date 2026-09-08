"""Build five standalone HTML entry points; no network or dependencies."""
from pathlib import Path
import base64
root=Path(__file__).resolve().parents[1]
assets=root/'assets'
shell=(assets/'shell.html').read_text()
shell=shell.replace('</head>', '<!-- Embedded Rubik license:\n'+'\n'.join(line.rstrip() for line in (assets/'OFL.txt').read_text().splitlines())+'\n--></head>')
css=(assets/'style.css').read_text()
for font in ('rubik-regular.ttf','rubik-bold.ttf'):
    encoded=base64.b64encode((assets/font).read_bytes()).decode()
    css=css.replace('url('+font+')','url(data:font/ttf;base64,'+encoded+')')
shell=shell.replace('<link rel="stylesheet" href="assets/style.css">','<style>'+css+'</style>')
for script in ('data.js','agent-flow.js','app.js'):
    shell=shell.replace('<script src="assets/'+script+'"></script>','<script>\n'+(assets/script).read_text()+'\n</script>')
for name,variant in [('index','A'),('variant-a','A'),('variant-b','B'),('variant-c','C'),('variant-d','D')]:
    html=shell.replace('<body data-variant="A">','<body data-variant="'+variant+'">')
    # Keep home working if a standalone entry is downloaded by itself.
    html=html.replace('href="index.html"','href="#"')
    (root/(name+'.html')).write_text(html)
print('Built 5 standalone HTML files, embedded Rubik (OFL), CSS and JavaScript.')

# Folder-local entry points are generated from the same sources, never hand-forked.
project=root.parents[2]
folders={'a':'a-merchant','b':'b-customer','c':'c-partner','d':'d-agent'}
for key,folder in folders.items():
    target=project/'variants'/folder/'prototype'/'index.html'
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes((root/('variant-'+key+'.html')).read_bytes())
print('Synced 4 variant-local prototypes.')
