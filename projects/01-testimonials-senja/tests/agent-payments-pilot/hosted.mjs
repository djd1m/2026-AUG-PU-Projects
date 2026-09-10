import assert from 'node:assert/strict';
export async function inspect({ state: s, b }) {
  assert.ok(s.hostedStarted && !s.settled);
  assert.equal(await b.js('return location.hostname'), 'yoomoney.ru');
  await b.until('return document.body.innerText.length>100', 45000);
  if (await b.js('return !document.querySelector("input") && document.body.innerText.includes("New card")')) {
    const node = await b.wd('/element', { using: 'xpath', value: '//*[normalize-space(text())="New card"]' });
    await b.wd('/element/' + Object.values(node)[0] + '/click', {});
    await b.until('return !!document.querySelector("input")');
  }
  return b.js('return {title:document.title,text:document.body.innerText.slice(0,2500),inputs:[...document.querySelectorAll("input")].map(x=>({type:x.type,name:x.name,id:x.id,placeholder:x.placeholder,autocomplete:x.autocomplete})),frames:[...document.querySelectorAll("iframe")].map(x=>({title:x.title,name:x.name})),buttons:[...document.querySelectorAll("button")].map(x=>({text:x.textContent.trim(),type:x.type})).filter(x=>x.text)}');
}
export async function pay({ state: s, save, b, record }) {
  assert.ok(s.hostedStarted && !s.cardSubmitted && !s.settled, 'Only one explicit card submission per owned order');
  assert.equal(await b.js('return location.hostname'), 'yoomoney.ru');
  assert.equal(await b.js('return document.body.innerText.includes("Payment via a test card")'), true, 'Provider page must explicitly be TEST');
  // Official YooKassa documentation: no-3DS test Mastercard; no real personal card.
  await b.fill('input[name="card-number"]', '5555555555554444');
  await b.fill('input[name="expiry-month"]', '12'); await b.fill('input[name="expiry-year"]', '30');
  await b.fill('input[name="security-code"]', '123');
  assert.equal(await b.js('return document.querySelector("input[name=send-email-invoice]").checked'), false, 'No receipt email to any other person');
  s.cardSubmitted = true; await save(); // Crash or timeout requires inspection, never blind resubmission.
  await b.click('button[type=submit]');
  await b.until('return !document.querySelector("input[name=card-number]")', 55000);
  record('official no-3DS TEST card submitted once on actual hosted PSP');
  return { host: await b.js('return location.hostname'), title: await b.js('return document.title') };
}
