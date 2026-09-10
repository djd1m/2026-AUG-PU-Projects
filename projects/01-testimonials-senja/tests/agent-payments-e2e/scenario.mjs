import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ORIGIN, PAY } from './network.mjs';
export async function scenario({ browser: b, provider, db, mcp, a2a, restartGateway, webFetch, evidence }) {
  const records = [], clients = [];
  const record = (name, detail = {}) => { records.push({ name, status: 'PASS', ...detail }); console.log(`PASS ${name}`); };
  const productId = 'proofwall-paid-30-days';
  const email = `agent-${randomUUID()}@example.test`, password = `Fixture ${randomUUID()}!`, slug = `agent-${randomUUID().slice(0, 8)}`;
  async function tool(client, name, input) { const r = await client.callTool({ name, arguments: input }); assert.equal(r.isError, undefined, `${name}: command failed`); return r.structuredContent; }
  async function pairing(client, name = 'Acceptance agent') { return tool(client, 'buyer_link_start', { displayName: name, audience: 'proofwall-agent-api' }); }
  async function humanState() { return b.js('return fetch("/api/agent-payments/human").then(r=>r.json())'); }
  const anonymous = await mcp(); clients.push(anonymous);
  const listed = await anonymous.listTools(); assert.equal(listed.tools.length, 6); assert.ok(!listed.tools.some(t => /approve|mandate|revoke/.test(t.name)));
  const link = await pairing(anonymous);
  record('actual MCP SDK discovery and persisted buyer pairing');
  await b.open(ORIGIN + '/'); await b.until('return !!document.querySelector("input[type=email]")');
  await b.fill('input[type=email]', email); await b.fill('input[type=password]', password);
  await b.label('Название проекта', 'Agent acceptance project'); await b.fill('input[placeholder=acme]', slug);
  await b.click('button[type=submit]'); await b.until(`return location.pathname==="/dashboard/${slug}"`);
  const account = (await db('select a.id as account_id,p.id as project_id from accounts a join projects p on p.account_id=a.id where a.email=$1 and p.slug=$2', [email, slug]))[0]; assert.ok(account);
  // Exercise ordinary login separately from registration-issued session.
  await b.wd('/cookie', undefined, 'DELETE'); await b.open(ORIGIN + '/login?next=' + encodeURIComponent('/agent-payments?pairingId=' + link.pairingId));
  await b.fill('input[name=email]', email); await b.fill('input[name=password]', password); await b.click('button[type=submit]');
  await b.until('return location.pathname.startsWith("/dashboard/")');
  await b.open(link.approvalUrl); await b.until('return location.pathname==="/agent-payments" && document.body.innerText.includes("Подтвердите почту")');
  const cookies = await b.wd('/cookie'); const session = cookies.find(c => c.name === 'pw_session'); assert.ok(session?.httpOnly && session?.secure);
  const consentDisabled = await b.js('return [...document.querySelectorAll("button")].find(b=>b.textContent.includes("Разрешить подключение")).disabled'); assert.equal(consentDisabled, true);
  await b.shot('01-unverified-pairing'); record('actual browser signup and login with secure human session');
  await b.button('Отправить письмо'); await b.until('return document.body.innerText.includes("Письмо отправлено")');
  const mailLink = provider.mailLink(email); await b.open(mailLink);
  await b.until('return location.hash==="" && [...document.querySelectorAll("button")].some(b=>b.textContent.includes("Подтвердить почту"))');
  assert.equal((await humanState()).emailVerified, false, 'Opening email link alone never grants proof');
  await b.button('Подтвердить почту'); await b.until('return !document.body.innerText.includes("Подтвердите почту")');
  assert.equal((await humanState()).emailVerified, true); record('actual Resend HTTP fixture and explicit browser email verification');
  await b.open(link.approvalUrl); await b.until('return document.body.innerText.includes("Подключить агента")');
  assert.equal(await b.js('return [...document.querySelectorAll("button")].find(b=>b.textContent.includes("Разрешить подключение")).disabled'), true);
  await b.checkbox('Я прочитал'); await b.shot('02-explicit-grant-consent'); await b.button('Разрешить подключение');
  await b.until('return !!document.querySelector("textarea")');
  const token = await b.js('return document.querySelector("textarea").value');
  const grantId = await b.js('return [...document.querySelectorAll("label")].find(l=>l.textContent.includes("Идентификатор доступа")).querySelector("input").value');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const polled = await tool(anonymous, 'buyer_link_status', { pairingId: link.pairingId, pollToken: link.pollToken });
  assert.equal(polled.status, 'approved'); assert.equal(JSON.stringify(polled).includes(token), false);
  const client = await mcp(token); clients.push(client); record('explicit browser grant consent; polling never exposes bearer');
  const quote = await tool(client, 'offer_get', { productId }); assert.deepEqual(quote.amount, { minor: '99000', currency: 'RUB' });
  const requestKey = randomUUID(); const order = await tool(client, 'order_create', { quoteId: quote.quoteId, requestKey });
  const replay = await a2a(token, 'message/send', { message: { kind: 'message', role: 'user', messageId: randomUUID(), parts: [{ kind: 'data', data: { command: 'order_create', input: { quoteId: quote.quoteId, requestKey } } }] } });
  assert.equal(replay.body.result.id, order.orderId);
  const execution = await tool(client, 'payment_execute', { orderId: order.orderId }); assert.equal(execution.nextAction.kind, 'human_approval'); assert.equal(provider.creates.length, 0);
  record('MCP and A2A share persisted order; grant alone never charges');
  await b.open(execution.nextAction.url); await b.until('return document.body.innerText.includes("Подтвердить покупку")');
  assert.equal(await b.js('return [...document.querySelectorAll("button")].find(b=>b.textContent.includes("Перейти к оплате")).disabled'), true);
  await b.checkbox('Сохранить способ оплаты'); await b.checkbox('Я прочитал'); await b.shot('03-explicit-purchase-and-save-consent');
  await b.button('Перейти к оплате'); await b.until(`return location.origin===${JSON.stringify(PAY)} && !!document.querySelector("#provider-pay")`);
  assert.equal(provider.creates.length, 1); assert.equal((await tool(client, 'order_get', { orderId: order.orderId })).paymentStatus, 'action_required');
  await b.shot('04-provider-hosted-test-payment'); await b.click('#provider-pay'); await b.until(`return location.origin===${JSON.stringify(ORIGIN)} && location.pathname==="/agent-payments"`);
  const paid = await tool(client, 'order_get', { orderId: order.orderId }); assert.equal(paid.paymentStatus, 'succeeded'); assert.equal(paid.fulfillmentStatus, 'active');
  assert.equal(JSON.stringify(paid).includes('fixture-saved-method'), false);
  const native = (await db('select p.tier,p.paid_until,cs.status from projects p join checkout_sessions cs on cs.project_id=p.id where p.id=$1', [account.project_id]))[0];
  assert.equal(native.tier, 'paid'); assert.equal(native.status, 'completed');
  assert.equal((await db('select count(*)::int as n from agent_payments.methods where merchant=$1 and buyer=$2 and resource=$3', ['proofwall', account.account_id, account.project_id]))[0].n, 1);
  await b.shot('05-return-after-verified-payment'); record('actual hosted TEST fixture payment settles tariff once and saves private method');
  const firstProviderId = [...provider.payments.keys()][0]; await provider.replay(firstProviderId);
  await tool(client, 'payment_execute', { orderId: order.orderId }); assert.equal(provider.creates.length, 1);
  record('verified webhook replay and execute replay create no additional payment');
  // Explicit test setup: represent the first purchase as a previous calendar-period purchase
  // and move this synthetic project's entitlement into its final two days. Production policy
  // and process clock are unchanged; only these generated test records are altered.
  const previousMonth = new Date(); previousMonth.setUTCDate(1); previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
  const period = previousMonth.toISOString().slice(0, 7);
  await db('update agent_payments.reservations set budget_period=$2 where order_id=$1', [order.orderId, period]);
  await db("update projects set paid_until=clock_timestamp()+interval '2 days' where id=$1", [account.project_id]);
  const renewalQuote = await tool(client, 'offer_get', { productId }); assert.equal(renewalQuote.autonomousEligible, true);
  const renewal = await tool(client, 'order_create', { quoteId: renewalQuote.quoteId, requestKey: randomUUID() });
  assert.equal((await tool(client, 'payment_execute', { orderId: renewal.orderId })).nextAction.kind, 'human_approval'); assert.equal(provider.creates.length, 1);
  await b.open(ORIGIN + '/agent-payments'); await b.until('return document.body.innerText.includes("Автоматическое продление") && !!document.querySelector("select")');
  await b.checkbox('Я прочитал'); await b.shot('06-independent-limited-mandate-consent'); await b.button('Разрешить ограниченное продление');
  await b.until('return [...document.querySelectorAll("label")].find(l=>l.textContent.includes("Идентификатор поручения")).querySelector("input").value.length===36');
  const mandateId = await b.js('return [...document.querySelectorAll("label")].find(l=>l.textContent.includes("Идентификатор поручения")).querySelector("input").value');
  const renewed = await tool(client, 'payment_execute', { orderId: renewal.orderId, mandateId }); assert.equal(renewed.paymentStatus, 'succeeded'); assert.equal(renewed.fulfillmentStatus, 'active');
  assert.equal(provider.creates.length, 2); assert.equal(provider.creates[1].saved, true);
  record('independent human limited mandate enables one saved-method renewal', { fixture: 'synthetic first spend moved to prior month; synthetic tariff moved to final two days' });
  await restartGateway(); const recovered = await a2a(token, 'tasks/get', { id: renewal.orderId }); assert.equal(recovered.body.result.status.state, 'completed');
  assert.equal(provider.creates.length, 2); record('A2A recovery after real gateway restart preserves settled order');
  const foreignProject = (await db('insert into projects(account_id,slug) values($1,$2) returning id', [account.account_id, 'foreign-' + randomUUID().slice(0, 8)]))[0];
  const anon2 = await mcp(); clients.push(anon2); const link2 = await pairing(anon2, 'Other resource agent');
  await b.open(link2.approvalUrl); await b.until('return document.body.innerText.includes("Подключить агента")');
  await b.js('const select=document.querySelector("select"); select.value=[...select.options].find(o=>o.value.startsWith("foreign-")).value; select.dispatchEvent(new Event("change",{bubbles:true}));');
  await b.checkbox('Я прочитал'); await b.button('Разрешить подключение'); await b.until('return !!document.querySelector("textarea")');
  const foreignToken = await b.js('return document.querySelector("textarea").value');
  const denied = await a2a(foreignToken, 'tasks/get', { id: order.orderId }); assert.equal(denied.status, 404); assert.ok(denied.body.error);
  record('valid foreign-resource grant cannot read another resource order');
  await b.js('const select=document.querySelector("select"); select.value=arguments[0]; select.dispatchEvent(new Event("change",{bubbles:true}));', slug);
  await b.label('Идентификатор доступа', grantId); await b.button('Отозвать доступ'); await b.until('return document.querySelector("[role=status]").textContent.includes("Сохранено")');
  const revoked = await a2a(token, 'tasks/get', { id: renewal.orderId }); assert.equal(revoked.status, 401); assert.equal(provider.creates.length, 2);
  record('browser grant revocation is enforced through actual A2A backend');
  for (const c of clients) await c.close().catch(() => {});
  return { records, projectId: account.project_id, accountId: account.account_id, orderIds: [order.orderId, renewal.orderId], providerCreateCount: provider.creates.length,
    browser: 'Firefox WebDriver, private isolated session', transports: 'real MCP SDK Streamable HTTP and actual A2A JSON-RPC gateway',
    fixtureDisclosure: 'YooKassa and Resend are local HTTPS HTTP fixtures. Renewal history/window seeded only for synthetic account; no real provider acceptance.' };
}
