import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { open, until, js, wd, noOverflow, screenshot } from '../helpers/browser.mjs';

test('public partner referral reaches configured Proofwall registration over HTTPS', async () => {
  const evidence = '.runtime/proofwall-public-smoke';
  const tenant = 'b439d03a-1156-48a6-b807-49bf77d44103';
  await open('https://n3-a.212.192.0.33.sslip.io/r/cb8662f3-8deb-494a-a220-e27fbbebf354');
  await until('return location.origin === "https://proofwall.aicoding.space" && location.pathname === "/" && !!document.querySelector("input[type=email]")');
  assert.equal(await js('return location.search'), '');
  const cookie = (await wd('/cookie')).find(c => c.name === `n3_ref_${tenant}`);
  assert.ok(cookie); assert.equal(cookie.secure, true); assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'Lax'); assert.equal(cookie.domain, 'proofwall.aicoding.space');
  assert.equal(await js('return document.cookie.includes("n3_ref_")'), false);
  assert.equal((await fetch('https://proofwall.aicoding.space/api/n3/program').then(r => r.json())).enabled, true);
  await noOverflow(); await screenshot(evidence, 'registration-desktop');
  await wd('/window/rect', { width: 390, height: 844 });
  await noOverflow(); await screenshot(evidence, 'registration-mobile');
  await writeFile(`${evidence}/summary.json`, JSON.stringify({ at: new Date().toISOString(),
    publicHttps: true, referralRedirect: true, privateCookie: true, bridgeEnabled: true,
    desktopAndMobileNoOverflow: true, createdUser: false, sentEmail: false, chargedProvider: false }, null, 2));
});
