import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { open, until, js, wd, noOverflow, screenshot } from '../helpers/browser.mjs';

const actor = process.env.N3_PUBLIC_REFERRAL_ACTOR;
const tenant = process.env.N3_PUBLIC_REFERRAL_TENANT;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
assert.match(actor ?? '', uuid, 'Explicit existing referral actor required');
assert.match(tenant ?? '', uuid, 'Explicit existing referral tenant required');
const evidence = '.runtime/proofwall-bcd-public';
const results = [];
await mkdir(evidence, { recursive: true });
for (const variant of ['b', 'c', 'd']) {
  test(`public ${variant.toUpperCase()} account and referral reach actual Proofwall`, async () => {
    const origin = `https://n3-${variant}.212.192.0.33.sslip.io`;
    await wd('/window/rect', { width: 1366, height: 900 });
    await open(`${origin}/account`);
    await until('return !!document.querySelector("#login") && !!document.querySelector("#email")');
    assert.equal(await js('return location.origin'), origin);
    await noOverflow(); await screenshot(evidence, `${variant}-account`);
    // This dedicated test browser may clear only its own merchant cookies.
    await open('https://proofwall.aicoding.space/');
    await wd('/cookie', undefined, 'DELETE');
    await open(`${origin}/r/${actor}`);
    await until('return location.origin === "https://proofwall.aicoding.space" && location.pathname === "/" && !!document.querySelector("input[type=email]")');
    assert.equal(await js('return location.search'), '');
    const cookie = (await wd('/cookie')).find(c => c.name === `n3_ref_${tenant}`);
    assert.ok(cookie); assert.equal(cookie.secure, true); assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Lax'); assert.equal(cookie.domain, 'proofwall.aicoding.space');
    assert.equal(await js('return document.cookie.includes("n3_ref_")'), false);
    await noOverflow(); await screenshot(evidence, `${variant}-merchant-desktop`);
    await wd('/window/rect', { width: 390, height: 844 });
    await noOverflow(); await screenshot(evidence, `${variant}-merchant-mobile`);
    results.push({ variant, publicAccountLoaded: true, publicReferralRedirect: true,
      merchantPrivateCookie: true, desktopMobileNoOverflow: true,
      createdUser: false, sentEmail: false, chargedProvider: false });
    await writeFile(`${evidence}/summary.json`, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  });
}
