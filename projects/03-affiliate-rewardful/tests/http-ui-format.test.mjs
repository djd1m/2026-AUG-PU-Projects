import test from 'node:test';
import assert from 'node:assert/strict';
import { escape, money, badge } from '../shared/ui/ui.mjs';

test('UI formats money without treating unknown amount as zero',()=>{
 assert.equal(money(undefined),'—');assert.equal(money(null),'—');assert.equal(money('30000'),'—');
 assert.match(money(30000),/300/);assert.match(money(0),/0/);assert.match(money(-30000),/-300/);
});
test('UI escapes untrusted provider names and status strings',()=>{
 const unsafe='"><img src=x onerror=alert(1)>';
 assert.doesNotMatch(escape(unsafe),/[<>"]/);assert.doesNotMatch(badge(unsafe),/<img/);
 assert.match(escape("Анна & Илья's"),/Анна &amp; Илья&#39;s/);
});
