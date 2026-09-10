import assert from 'node:assert/strict';
import { actualMailLink } from './clients.mjs';
export async function identity({ state: s, save, b, c, record }) {
  if (!s.link) {
    await c.mcp(undefined, async client => { const list = await client.listTools(); assert.equal(list.tools.length, 6); });
    s.link = await c.tool('buyer_link_start', { displayName: 'Public TEST pilot agent', audience: 'proofwall-agent-api' }, undefined); await save();
    record('public real MCP SDK discovery and pairing');
  }
  if (!s.registered) {
    await b.open(s.webOrigin + '/'); await b.until('return !!document.querySelector("input[type=email]")');
    await b.fill('input[type=email]', s.email); await b.fill('input[type=password]', s.password);
    await b.label('Название проекта', 'Public TEST pilot'); await b.fill('input[placeholder=acme]', s.slug); await b.click('button[type=submit]');
    await b.until('return location.pathname===arguments[0]'.replace('arguments[0]', JSON.stringify('/dashboard/' + s.slug)));
    s.registered = true; await save();
  }
  if (!s.loggedIn) {
    await b.wd('/cookie', undefined, 'DELETE'); await b.open(s.webOrigin + '/login');
    await b.fill('input[name=email]', s.email); await b.fill('input[name=password]', s.password); await b.click('button[type=submit]');
    await b.until(`return location.pathname===${JSON.stringify('/dashboard/' + s.slug)}`);
    const cookies = await b.wd('/cookie'); const session = cookies.find(x => x.name === 'pw_session');
    assert.ok(session?.httpOnly && session?.secure); s.loggedIn = true; await save(); record('public browser signup and ordinary secure login');
  }
  if (!s.verified) {
    await b.open(s.link.approvalUrl); await b.until('return document.body.innerText.includes("Подтвердите почту")');
    assert.equal(await b.js('return [...document.querySelectorAll("button")].find(x=>x.textContent.includes("Разрешить подключение")).disabled'), true);
    await b.shot('01-unverified-consent-disabled');
    if (!s.mailSent) { await b.button('Отправить письмо'); await b.until('return document.body.innerText.includes("Письмо отправлено")'); s.mailSent = true; await save(); }
    const url = await actualMailLink(s); await save(); await b.open(url);
    await b.until('return location.hash==="" && [...document.querySelectorAll("button")].some(x=>x.textContent.includes("Подтвердить почту"))');
    assert.equal((await b.js('return fetch("/api/agent-payments/human").then(r=>r.json())')).emailVerified, false);
    await b.button('Подтвердить почту'); await b.until('return !document.body.innerText.includes("Подтвердите почту")');
    assert.equal((await b.js('return fetch("/api/agent-payments/human").then(r=>r.json())')).emailVerified, true);
    s.verified = true; await save(); record('real Resend test delivery and explicit public email proof', s.mailEvidence);
  }
  if (!s.token) {
    await b.open(s.link.approvalUrl); await b.until('return document.body.innerText.includes("Подключить агента")');
    await b.checkbox('Я прочитал'); await b.shot('02-explicit-grant-consent'); await b.button('Разрешить подключение');
    await b.until('return !!document.querySelector("textarea")');
    s.token = await b.js('return document.querySelector("textarea").value');
    s.grantId = await b.js('return [...document.querySelectorAll("label")].find(x=>x.textContent.includes("Идентификатор доступа")).querySelector("input").value');
    await save(); assert.match(s.token, /^[A-Za-z0-9_-]{43}$/);
    const polled = await c.tool('buyer_link_status', { pairingId: s.link.pairingId, pollToken: s.link.pollToken }, undefined);
    assert.equal(polled.status, 'approved'); assert.equal(JSON.stringify(polled).includes(s.token), false);
    record('explicit human grant through public browser; polling hides bearer');
  }
}
