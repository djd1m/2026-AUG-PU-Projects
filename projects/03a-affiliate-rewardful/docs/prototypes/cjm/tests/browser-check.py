"""Real Firefox smoke check of standalone CJM HTML, not a backend/payment test."""
from pathlib import Path
import json, urllib.request, urllib.error, base64, datetime, hashlib, time

project = Path(__file__).resolve().parents[4]
root = Path(__file__).resolve().parents[1]
session = json.loads((project / '.runtime/browser-session.json').read_text())['value']['sessionId']
base = 'http://127.0.0.1:4573/session/' + session
results = []

def req(path, data=None):
    q = urllib.request.Request(base + path, data=None if data is None else json.dumps(data).encode(), headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(q, timeout=50) as r:
            obj = json.load(r)['value']
    except urllib.error.HTTPError as e:
        raise RuntimeError(e.read().decode())
    if isinstance(obj, dict) and obj.get('error'):
        raise RuntimeError(obj)
    return obj

def js(code):
    return req('/execute/sync', {'script':code,'args':[]})

def check(name, passed):
    results.append({'name':name,'pass':bool(passed)})
    if not passed:
        raise AssertionError(name)

def snapshot(name):
    time.sleep(.3)
    (root/'tests'/name).write_bytes(base64.b64decode(req('/screenshot')))

req('/timeouts', {'pageLoad':30000,'script':30000})
req('/window/rect', {'width':1440,'height':1050})
req('/url', {'url':(root/'index.html').as_uri()})
check('standalone loads', js('return !!document.querySelector("h1")'))
check('no initial approval', js('return document.body.innerText.includes("Ни один вариант не выбран")'))
for width in [1440,768,390,320]:
    req('/frame', {'id':None})
    if width == 1440:
        req('/url', {'url':(root/'index.html').as_uri()})
    else:
        req('/url', {'url':(root/'tests/mobile-harness.html').as_uri()+'?w='+str(width)})
        el = req('/element', {'using':'css selector','value':'#frame'})
        req('/frame', {'id':el})
        for _ in range(40):
            if js('return !!document.querySelector("#scene h1")'):
                break
            time.sleep(.05)
    check(f'actual width {width}', js('return innerWidth') == width)
    for variant in ['A','B','C']:
        for step in range(6):
            result = js(f'''document.querySelector('[data-variant="{variant}"]').click();
              document.querySelector('[data-step="{step}"]').click();
              return {{heading:!!document.querySelector('#scene h1'),overflow:document.documentElement.scrollWidth>innerWidth,
                active:document.querySelectorAll('[aria-current="step"]').length,role:document.querySelector('#actor').textContent}};''')
            check(f'{variant}/{step+1}@{width}', result['heading'] and not result['overflow'] and result['active']==1 and bool(result['role']))
    if width == 390:
        js('document.querySelector("[data-variant=A]").click();window.scrollTo(0,0)')
        req('/frame', {'id':None})
        js('window.scrollTo(0,0)')
        time.sleep(.3)
        el=req('/element',{'using':'css selector','value':'#frame'})
        eid=next(iter(el.values()))
        (root/'tests/mobile-390.png').write_bytes(base64.b64decode(req('/element/'+eid+'/screenshot')))

req('/frame', {'id':None})
req('/url', {'url':(root/'index.html').as_uri()})
flow = js('''const out=[], q=s=>document.querySelector(s), click=s=>q(s).click(), test=(name,pass)=>out.push({name,pass:!!pass}), text=()=>q('#scene').innerText.replace(/\\s/g,'');
click('[data-variant=A]');click('[data-step="2"]');test('registration has zero commission',text().includes('комиссия0'));
click('[data-action=pay]');test('first commission198',text().includes('198'));
click('[data-action=duplicate]');test('duplicate preserves198',text().includes('198')&&!text().includes('396'));
click('[data-step="3"]');test('share at first commission',!q('[data-action=share]').disabled);click('[data-action=refund]');test('partial refund balance132',text().includes('132'));
click('[data-action=renew]');test('renewal belongs October',text().includes('15.10')&&text().includes('5ноября'));
click('[data-step="4"]');test('September net132',text().includes('132'));
q('#period').value='10';q('#period').dispatchEvent(new Event('change',{bubbles:true}));test('October198',text().includes('198')&&!text().includes('132'));
q('#period').value='09';q('#period').dispatchEvent(new Event('change',{bubbles:true}));
window.__blobs=[];window.__downloads=[];window.__origURL=URL.createObjectURL;window.__origClick=HTMLAnchorElement.prototype.click;
URL.createObjectURL=b=>{window.__blobs.push(b);return window.__origURL(b)};HTMLAnchorElement.prototype.click=function(){window.__downloads.push(this.download)};
click('[data-action=csv]');test('export not paid',text().includes('Ожидаетручногоперевода'));
click('[data-action=mark]');test('manual confirmation dialog',q('dialog').open);click('[data-action=confirm-mark]');test('manual paid mark',text().includes('Отмеченовручную'));
click('[data-action=csv]');test('paid persists after export',text().includes('Отмеченовручную'));test('repeat mark disabled',q('[data-action=mark]').disabled);
click('[data-variant=B]');click('[data-step="1"]');click('[data-action=join]');test('consent required',!!q('#consent-error').textContent);
q('#consent').checked=true;click('[data-action=join]');test('link after consent',!!q('input[value="https://proofwall.example/?ref=ANNA"]'));
click('[data-variant=C]');click('[data-step="3"]');click('[data-action=pay]');click('[data-action=delay]');test('delay explicit',text().includes('Ожидаем'));
click('[data-step="4"]');const n=window.__downloads.length;click('[data-action=csv]');test('incomplete reconciliation blocks export',window.__downloads.length===n);
click('[data-step="3"]');click('[data-action=delay]');test('reconciliation restored',text().includes('Совпадает'));
click('[data-action=compare]');test('compare opens',q('dialog').open);test('three distinct loops',q('#dialog-body').innerText.includes('Badge loop')&&q('#dialog-body').innerText.includes('Sales loop')&&q('#dialog-body').innerText.includes('Incentivized referral'));
click('[data-preview=B]');test('preview switches variant',q('[data-variant=B]').getAttribute('aria-selected')==='true');
click('[data-action=mix]');test('mix controls present',!!q('#choice-entry'));q('#choice-notes').value='<test>';click('[data-action=export-choice]');test('choice export',window.__downloads.at(-1)==='n3a-cjm-choice.txt');click('[data-action=close]');
click('[data-action=meta]');test('notes hidden',getComputedStyle(q('#meta')).display==='none');click('[data-action=meta]');
click('[data-action=reset]');test('reset to first step',q('[data-step="0"]').getAttribute('aria-current')==='step');
test('no PRD approval inferred',document.body.innerText.includes('Ни один вариант не выбран'));return out;''')
for item in flow:
    check(item['name'],item['pass'])
exports=req('/execute/async',{'script':'const done=arguments[arguments.length-1];Promise.all(window.__blobs.map(b=>b.text())).then(done);','args':[]})
check('CSV amounts and month', 'Анна;Сентябрь 2026;198;-66;132;5 октября;Не перечислено' in exports[0])
check('CSV paid status', 'Отмечено вручную' in exports[1])
check('choice remains draft', 'черновик выбора' in exports[2] and '<test>' in exports[2])
for variant in ['A','B','C']:
    req('/url', {'url':(root/f'variant-{variant.lower()}.html').as_uri()})
    check(f'direct {variant}',js(f'return document.querySelector("[data-variant={variant}]").getAttribute("aria-selected")==="true"'))
    snapshot(f'variant-{variant.lower()}-desktop.png')
req('/url', {'url':(root/'index.html').as_uri()})
js('document.querySelector("[data-step=\\"2\\"]").click();document.querySelector("[data-action=pay]").click();document.querySelector("[data-step=\\"4\\"]").click()')
snapshot('payout-desktop.png')
report={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'browser':'Firefox WebDriver','scope':'offline HTML interactions only; no real provider/backend verification','checks':results,'passed':all(r['pass'] for r in results),'count':len(results),'source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in root.glob('*.html')}}
(root/'tests/browser-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':report['passed'],'checks':len(results)},ensure_ascii=False))
