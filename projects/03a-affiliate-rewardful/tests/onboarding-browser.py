"""Real Firefox + built app + private PostgreSQL journey. No mocks or real identities.

Adapted stdlib WebDriver request/js/check helpers from docs/prototypes/cjm/tests/browser-check.py.
Usage: python3 tests/onboarding-browser.py PRIVATE_FIXTURE_JSON ORIGIN EVIDENCE_DIR
"""
from pathlib import Path
import base64, datetime, hashlib, json, os, socket, stat, subprocess, sys, tempfile, time
import urllib.request, urllib.error, urllib.parse

project = Path(__file__).resolve().parents[1]
fixture_path = Path(sys.argv[1]).resolve()
origin = sys.argv[2]
output = Path(sys.argv[3]).resolve()
assert fixture_path.is_relative_to(project / '.runtime') and fixture_path.is_file()
assert stat.S_IMODE(fixture_path.stat().st_mode) == 0o600
assert urllib.parse.urlsplit(origin).hostname == 'localhost'
fixture = json.loads(fixture_path.read_text())
output.mkdir(parents=True, exist_ok=True)
results = []
started = datetime.datetime.now(datetime.timezone.utc)

def sources():
    paths = []
    for folder in ['apps/web/src', 'packages/db/src', 'packages/db/migrations']:
        paths.extend(p for p in (project / folder).rglob('*') if p.is_file())
    paths += [Path(__file__), project / 'apps/web/.next/BUILD_ID']
    return {str(p.relative_to(project)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}

source_hashes = sources()

def check(name, passed):
    results.append({'name': name, 'pass': bool(passed)})
    if not passed:
        raise AssertionError(name)
    print('PASS ' + name, flush=True)

def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]

driver_port = free_port()
driver_url = 'http://127.0.0.1:' + str(driver_port)
session = None

def request(path, data=None, method=None):
    req = urllib.request.Request(driver_url + path, data=None if data is None else json.dumps(data).encode(),
                                 headers={'Content-Type': 'application/json'}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            value = json.load(response)['value']
    except urllib.error.HTTPError as error:
        # Keep only closed error code and command name; never echo form arguments/messages.
        try:
            detail = json.loads(error.read()).get('value', {})
            code = detail.get('error', 'unknown')
            if path.endswith('/url'): print('Navigation error: ' + str(detail.get('message', ''))[:700], flush=True)
        except Exception: code = 'unknown'
        allowed = ['session not created', 'unknown error', 'no such element', 'invalid argument', 'timeout', 'javascript error', 'element not interactable', 'no such window']
        safe = code if code in allowed else 'unknown'
        print('WebDriver failure: ' + safe + ' command=' + path.rsplit('/', 1)[-1], flush=True)
        raise RuntimeError('webdriver_command_failed') from None
    if isinstance(value, dict) and value.get('error'):
        raise RuntimeError('webdriver_command_failed')
    return value

def call(path, data=None, method=None):
    return request('/session/' + session + path, data, method)

def js(script, args=None):
    return call('/execute/sync', {'script': script, 'args': args or []})

def wait_for(script, timeout=20):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        if js(script): return
        time.sleep(.15)
    raise AssertionError('browser_state_timeout')

def element(selector):
    return call('/element', {'using': 'css selector', 'value': selector})['element-6066-11e4-a52e-4f735466cecf']

def fill(selector, text):
    target = element(selector)
    call('/element/' + target + '/clear', {})
    call('/element/' + target + '/value', {'text': text})

def click(selector):
    call('/element/' + element(selector) + '/click', {})

def select(selector, value):
    js('const e=document.querySelector(arguments[0]);e.value=arguments[1];e.dispatchEvent(new Event("change",{bubbles:true}));', [selector, value])

def navigate(path):
    call('/url', {'url': origin + path})

def get_api(path):
    return call('/execute/async', {'script': '''const done=arguments[arguments.length-1];
      fetch(arguments[0],{cache:'no-store',credentials:'same-origin'}).then(async r=>done({status:r.status,
      cache:r.headers.get('cache-control'),body:await r.json()})).catch(()=>done({status:0}));''', 'args': [path]})

def chord(key):
    call('/actions', {'actions': [{'type': 'key', 'id': 'keyboard', 'actions': [
        {'type': 'keyDown', 'value': '\ue009'}, {'type': 'keyDown', 'value': key},
        {'type': 'keyUp', 'value': key}, {'type': 'keyUp', 'value': '\ue009'}]}]})

def viewport(width):
    chord('0')
    call('/window/rect', {'width': width * 2 if width < 500 else width, 'height': 1200})
    # Only this test's private browser chrome context: actual native zoom, never app CSS.
    call('/moz/context', {'context': 'chrome'})
    call('/execute/sync', {'script': 'window.gBrowser.selectedBrowser.browsingContext.fullZoom=arguments[0];', 'args': [2 if width < 500 else 1]})
    call('/moz/context', {'context': 'content'})
    time.sleep(.2)
    check('actual CSS viewport ' + str(width), js('return innerWidth') == width)

def screenshot(name):
    # Called only after secrets have left the rendered forms.
    (output / (name + '.png')).write_bytes(base64.b64decode(call('/screenshot')))

def responsive(name):
    for width in [320, 390, 768, 1440]:
        viewport(width)
        check(name + ' fits ' + str(width), js('return document.documentElement.scrollWidth<=innerWidth'))
        check(name + ' labels ' + str(width), js('''return [...document.querySelectorAll('input,textarea,select')]
          .filter(e=>e.type!=='hidden').every(e=>e.labels.length||e.getAttribute('aria-label'));'''))
        call('/actions', {'actions': [{'type': 'key', 'id': 'keyboard', 'actions': [
            {'type': 'keyDown', 'value': '\ue004'}, {'type': 'keyUp', 'value': '\ue004'}]}]})
        check(name + ' keyboard focus ' + str(width), js('return document.activeElement!==document.body'))
        screenshot(name + '-' + str(width))
    viewport(1440)

def new_session(javascript=True):
    global session
    value = request('/session', {'capabilities': {'alwaysMatch': {'browserName': 'firefox',
        'moz:firefoxOptions': {'args': ['-headless'], 'binary': '/snap/firefox/current/usr/lib/firefox/firefox',
                              'prefs': {'javascript.enabled': javascript}}}}})
    session = value['sessionId']
    call('/timeouts', {'pageLoad': 30000, 'script': 30000})
    call('/window/rect', {'width': 1440, 'height': 1200})

def end_session():
    global session
    if session:
        try: call('', method='DELETE')
        finally: session = None

def join(identity, password, token):
    navigate('/join')
    wait_for('return !!document.querySelector("[name=grant_token]")')
    fill('[name=grant_token]', token)
    fill('[name=identity]', identity)
    fill('[name=password]', password + '\ue007')
    wait_for('return !!document.querySelector("#preview-title")')

def logout():
    navigate('/onboarding')
    wait_for('return !!document.querySelector("#memberships-title") && !document.querySelector("button[disabled]")')
    target = js('return [...document.querySelectorAll("button")].find(e=>e.textContent==="Выйти")')
    call('/element/' + target['element-6066-11e4-a52e-4f735466cecf'] + '/click', {})
    wait_for('return location.pathname==="/login"')

failed = None
with tempfile.TemporaryDirectory(prefix='n3a-browser-', dir='/root/snap/firefox/common') as profile, tempfile.TemporaryFile() as driver_log:
    driver = subprocess.Popen(['/snap/bin/geckodriver', '--host', '127.0.0.1', '--port', str(driver_port),
                               '--websocket-port', str(free_port()), '--profile-root', profile, '--allow-system-access'],
                              stdout=driver_log, stderr=driver_log)
    try:
        for attempt in range(100):
            try: request('/status'); break
            except Exception:
                if driver.poll() is not None: raise RuntimeError('webdriver_start_failed')
                time.sleep(.1)
        new_session(False)
        navigate('/join')
        fill('[name=grant_token]', fixture['grant_token'])
        fill('[name=identity]', fixture['owner']['identity'])
        fill('[name=password]', fixture['owner']['password'])
        click('form button[type=submit]')
        time.sleep(.5)
        check('JavaScript-disabled form never puts credentials or grant in URL', call('/url') == origin + '/join')
        end_session()
        new_session()
        join(fixture['owner']['identity'], fixture['owner']['password'], fixture['grant_token'])
        check('owner role is explicit before acceptance', js('return document.body.innerText.includes("владелец")'))
        click('.join-card .button-primary')
        wait_for('return !!document.querySelector("#policy-title")')
        check('browser session keeps Secure HttpOnly', any(c['name']=='__Host-n3a_session' and c['secure'] and c['httpOnly'] and c.get('sameSite')=='Lax' for c in call('/cookie')))
        check('browser secret cookie hidden from JavaScript', js('return isSecureContext && !document.cookie.includes("__Host-n3a_session")'))
        fill('[name=rate]', '28.29')
        select('[name=rate_unit]', 'percent')
        select('[name=attribution_days]', '60')
        fill('[name=timezone]', 'Europe/Moscow')
        terms = '  Условия пилота: вознаграждение за подтверждённые оплаты.\n<script>window.__n3a_terms_executed=true</script>\n'
        fill('[name=terms_text]', terms)
        click('[name=effective_mode][value=now]')
        click('[name=acknowledged]')
        click('section[aria-labelledby=policy-title] button[type=submit]')
        wait_for('return document.body.innerText.includes("Текущая версия: 1")')
        program_path = '/api/programs/' + fixture['program_id']
        program = get_api(program_path)
        policy = program['body']['data']['current_policy']
        check('policy persists exact terms and integer percentage', program['status']==200 and policy['terms_text']==terms and policy['rate_bp']==2829 and policy['terms_hash']==hashlib.sha256(terms.encode()).hexdigest())
        check('private API is no-store', program['cache']=='no-store')
        fill('section[aria-labelledby=invite-title] [name=identity]', fixture['partner']['identity'])
        select('[name=role]', 'partner')
        expiry = (datetime.datetime.now() + datetime.timedelta(hours=48)).strftime('%Y-%m-%dT%H:%M')
        # datetime-local keyboard formats vary with locale; native property + change uses app form.
        select('[name=expires_at]', expiry)
        for kind in ['identity', 'authority']:
            fill('[name=' + kind + '_reference]', fixture['invitation_evidence'][kind]['reference'])
            fill('[name=' + kind + '_sha256]', fixture['invitation_evidence'][kind]['sha256'])
        click('section[aria-labelledby=invite-title] button[type=submit]')
        wait_for('return !!document.querySelector("section[aria-labelledby=invite-title] textarea[readonly]")')
        partner_grant = js('return document.querySelector("section[aria-labelledby=invite-title] textarea[readonly]").value')
        check('invitation action has no false error after success', js('return !document.querySelector("section[aria-labelledby=invite-title] [role=alert]")'))
        navigate('/programs/' + fixture['program_id'] + '/setup')
        wait_for('return !!document.querySelector("#policy-title")')
        check('one-time invitation disappears after reload', js('return !document.querySelector("textarea[readonly]")'))
        responsive('owner')
        logout()
        # Stay within the actual production source budget; do not reset/bypass admission rows.
        print('Waiting for next admission window before partner journey', flush=True)
        until = time.monotonic() + 60 - time.time() % 60 + 1
        while time.monotonic() < until: time.sleep(min(10, max(0, until-time.monotonic())))
        join(fixture['partner']['identity'], fixture['partner']['password'], partner_grant)
        check('exact readable terms rendered as text', js('return document.querySelector(".terms-text").textContent') == terms)
        check('stored terms cannot execute script', js('return typeof window.__n3a_terms_executed === "undefined"'))
        before = get_api(program_path + '/partner-assets')
        check('pre-consent partner assets deny', before['status']==404)
        click('.join-card .button-primary')
        check('unchecked consent stays on invitation', js('return !!document.querySelector("#preview-title")'))
        click('.terms-panel input[type=checkbox]')
        click('.join-card .button-primary')
        wait_for('return document.querySelectorAll(".asset-card").length===2')
        assets = get_api(program_path + '/partner-assets')
        data = assets['body']['data']
        check('consent references exact persisted policy', assets['status']==200 and data['accepted_policy_id']==policy['id'] and len(data['assets'])==2)
        check('draft and not-ready remain explicit', data['program_status']=='draft' and data['integration_status']=='not_ready')
        check('assets are honest and show no invented balances', js('return document.body.innerText.includes("отслеживание") && !document.body.innerText.includes("Баланс")'))
        click('.asset-card button')
        wait_for('return document.body.innerText.includes("Скопировано")')
        check('asset copy reports actual success', True)
        navigate('/programs/' + fixture['program_id'] + '/partner')
        wait_for('return document.querySelectorAll(".asset-card").length===2')
        check('partner assets survive reload', get_api(program_path + '/partner-assets')['body']['data']['assets']==data['assets'])
        responsive('partner')
        logout()
        fill('[name=identity]', fixture['owner']['identity'])
        fill('[name=password]', fixture['owner']['password'] + '\ue007')
        wait_for('return location.pathname==="/onboarding"')
        navigate('/programs/' + fixture['program_id'] + '/setup')
        wait_for('return [...document.querySelectorAll("button")].some(e=>e.textContent==="Приостановить")')
        def named_button(label):
            target = js('return [...document.querySelectorAll("button")].find(e=>e.textContent===arguments[0])', [label])
            call('/element/' + target['element-6066-11e4-a52e-4f735466cecf'] + '/click', {})
        named_button('Материалы')
        wait_for('return !!document.querySelector(".asset-admin")')
        revoked_id = next(a['id'] for a in data['assets'] if a['kind']=='link')
        click('.asset-row button')
        wait_for('return !document.querySelector(".asset-admin")')
        named_button('Приостановить')
        wait_for('return document.body.innerText.includes("Возобновить")')
        navigate('/programs/' + fixture['program_id'] + '/setup')
        wait_for('return document.body.innerText.includes("Возобновить")')
        check('owner can reactivate suspended partner after reload', True)
        named_button('Возобновить')
        wait_for('return document.body.innerText.includes("Приостановить")')
        restored = get_api(program_path + '/partner-assets?partner_id=' + data['partner_id'])
        check('reactivation preserves individually revoked asset', restored['status']==200 and next(a['status'] for a in restored['body']['data']['assets'] if a['id']==revoked_id)=='revoked')
        check('no grant or credential in browser URL', urllib.parse.urlsplit(call('/url')).query=='')
        check('source snapshot stayed unchanged', sources()==source_hashes)
    except Exception as error:
        failed = type(error).__name__
        print('FAIL browser journey: ' + failed, flush=True)
    finally:
        try: end_session()
        except Exception: pass
        driver.terminate()
        try: driver.wait(timeout=5)
        except subprocess.TimeoutExpired: driver.kill(); driver.wait()

ended = datetime.datetime.now(datetime.timezone.utc)
report = {'started_at': started.isoformat(), 'ended_at': ended.isoformat(),
          'elapsed_wall_ms': int((ended-started).total_seconds()*1000), 'source_sha256': source_hashes,
          'checks': results, 'status': 'failed' if failed else 'passed', 'failure_kind': failed}
(output / 'browser-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
if failed: sys.exit(1)
print('PASS real browser onboarding journey', flush=True)
