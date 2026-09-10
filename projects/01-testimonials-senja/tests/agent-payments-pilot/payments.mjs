import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function purchase({ state: s, save, b, c, record }) {
  assert.ok(s.token && !s.revoked);
  if (!s.order) {
    const quote = await c.tool('offer_get', { productId: 'proofwall-paid-30-days' });
    assert.deepEqual(quote.amount, { minor: '99000', currency: 'RUB' }); s.quote = quote; s.requestKey = randomUUID(); await save();
    s.order = await c.tool('order_create', { quoteId: quote.quoteId, requestKey: s.requestKey }); await save();
    const replay = await c.a2a('message/send', { message: { kind: 'message', role: 'user', messageId: randomUUID(), parts: [{ kind: 'data',
      data: { command: 'order_create', input: { quoteId: quote.quoteId, requestKey: s.requestKey } } }] } });
    assert.equal(replay.body.result.id, s.order.orderId);
    const result = await c.tool('payment_execute', { orderId: s.order.orderId }); assert.equal(result.nextAction.kind, 'human_approval');
    s.approvalUrl = result.nextAction.url; await save(); record('public MCP and A2A share order; grant alone requires human approval');
  }
  if (!s.hostedStarted) {
    await b.open(s.approvalUrl); await b.until('return document.body.innerText.includes("Подтвердить покупку")');
    assert.equal(await b.js('return [...document.querySelectorAll("button")].find(x=>x.textContent.includes("Перейти к оплате")).disabled'), true);
    await b.checkbox('Сохранить способ оплаты'); await b.checkbox('Я прочитал'); await b.shot('03-explicit-purchase-save-consent');
    await b.button('Перейти к оплате'); await b.until('return location.hostname==="yoomoney.ru" || location.hostname==="yookassa.ru"', 55000);
    s.hostedStarted = true; await save();
    const result = await c.tool('order_get', { orderId: s.order.orderId }); assert.equal(result.paymentStatus, 'action_required');
    record('actual provider hosted payment reached after explicit human purchase/save consent');
  }
  // Inspect field structure without values. Never screenshot the provider page.
  return b.js('return {host:location.hostname,title:document.title,inputs:[...document.querySelectorAll("input")].map(x=>({type:x.type,name:x.name,id:x.id,placeholder:x.placeholder,autocomplete:x.autocomplete})),frames:[...document.querySelectorAll("iframe")].map(x=>({title:x.title,name:x.name})),buttons:[...document.querySelectorAll("button")].map(x=>x.textContent.trim()).filter(Boolean)}');
}
export async function settle({ state: s, save, b, c, record }) {
  assert.ok(s.hostedStarted);
  let order;
  for (let n = 0; n < 30; n++) {
    order = await c.tool('order_get', { orderId: s.order.orderId });
    if (order.paymentStatus === 'succeeded' && order.fulfillmentStatus === 'active') break;
    if (order.paymentStatus === 'canceled') throw Error('Actual TEST PSP canceled payment');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  assert.equal(order.paymentStatus, 'succeeded'); assert.equal(order.fulfillmentStatus, 'active');
  s.settled = true; await save(); record('actual TEST PSP payment verified and native tariff active');
  const replay = await c.tool('payment_execute', { orderId: s.order.orderId }); assert.equal(replay.orderId, order.orderId); assert.equal(replay.paymentStatus, 'succeeded');
  const task = await c.a2a('tasks/get', { id: order.orderId }); assert.equal(task.body.result.status.state, 'completed');
  record('public execute replay and A2A completed status preserve first order');
  await b.open(s.webOrigin + '/agent-payments'); await b.shot('04-after-settlement');
}
export async function mandate({ state: s, save, b, c, record }) {
  assert.ok(s.settled);
  if (!s.mandateId) {
    await b.open(s.webOrigin + '/agent-payments'); await b.until('return document.body.innerText.includes("Автоматическое продление")');
    await b.checkbox('Я прочитал'); await b.shot('05-independent-mandate-consent'); await b.button('Разрешить ограниченное продление');
    await b.until('return [...document.querySelectorAll("label")].find(x=>x.textContent.includes("Идентификатор поручения")).querySelector("input").value.length===36');
    s.mandateId = await b.js('return [...document.querySelectorAll("label")].find(x=>x.textContent.includes("Идентификатор поручения")).querySelector("input").value');
    await save(); record('independent limited mandate issued by explicit human consent');
  }
  const quote = await c.tool('offer_get', { productId: 'proofwall-paid-30-days' });
  if (!quote.autonomousEligible) { record('autonomous renewal correctly unavailable outside renewal window'); return; }
  assert.equal(process.env.PILOT_RENEWAL_AUTHORIZED, 'true', 'Coordinator must authorize scoped renewal setup and second actual TEST call');
  if (!s.renewal) { s.renewal = await c.tool('order_create', { quoteId: quote.quoteId, requestKey: randomUUID() }); await save(); }
  let result = await c.tool('payment_execute', { orderId: s.renewal.orderId, mandateId: s.mandateId });
  for (let n = 0; n < 30 && result.paymentStatus !== 'succeeded'; n++) {
    assert.notEqual(result.paymentStatus, 'canceled', 'Actual TEST saved-method renewal canceled');
    await new Promise(resolve => setTimeout(resolve, 2000)); result = await c.tool('order_get', { orderId: s.renewal.orderId });
  }
  assert.equal(result.paymentStatus, 'succeeded'); assert.equal(result.fulfillmentStatus, 'active');
  s.renewed = true; await save(); record('actual saved-method TEST renewal through public MCP under independent mandate');
  const replay = await c.tool('payment_execute', { orderId: s.renewal.orderId, mandateId: s.mandateId });
  assert.equal(replay.orderId, s.renewal.orderId); assert.equal(replay.paymentStatus, 'succeeded');
  const task = await c.a2a('tasks/get', { id: s.renewal.orderId }); assert.equal(task.body.result.status.state, 'completed');
  record('saved-method renewal replay and A2A completed task preserve second order');
}
export async function revoke({ state: s, save, b, c, record }) {
  await b.open(s.webOrigin + '/agent-payments'); await b.until('return document.body.innerText.includes("Отозвать доступ агента")');
  if (s.mandateId) { await b.label('Идентификатор поручения', s.mandateId); await b.button('Отозвать поручение'); await b.until('return document.querySelector("[role=status]").textContent.includes("Сохранено")'); }
  await b.label('Идентификатор доступа', s.grantId); await b.button('Отозвать доступ');
  await b.until('return document.querySelector("[role=status]").textContent.includes("Сохранено")');
  const denied = await c.a2a('tasks/get', { id: s.order.orderId }); assert.equal(denied.status, 401);
  s.revoked = true; await save(); record('public browser revocation denies subsequent agent access');
}
