import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { privateFixtureOrigin, runContainer } from '../scripts/responsive/container-run.mjs';
import { validateFixture } from '../scripts/responsive/input.mjs';
it('local TLS opt-in rejects public origins and URL tricks', () => {
  for (const u of ['https://192.168.128.1:4443','https://127.0.0.1','https://172.31.0.1','https://localhost']) expect(privateFixtureOrigin(u)).toBe(true);
  for (const u of ['https://clipmkr.ru','https://192.168.1.1.evil.test','http://127.0.0.1','https://localhost@evil.test','https://localhost/?x=1']) expect(privateFixtureOrigin(u)).toBe(false);
});
it('rejects container argument injection before Docker work', async () => {
  const previous = process.env.N5_PLAYWRIGHT_CONTAINER; process.env.N5_PLAYWRIGHT_CONTAINER = 'name; touch /tmp/owned';
  try { expect(await runContainer('responsive', [])).toBe(2); } finally { if (previous === undefined) delete process.env.N5_PLAYWRIGHT_CONTAINER; else process.env.N5_PLAYWRIGHT_CONTAINER = previous; }
});
it('extra responsive routes are exact allowlisted values', () => {
  const f = { email: 'synthetic@example.test', password: 'synthetic', video_id: 'v1', short_code: 's1', clip_ids: ['c1'], screens: { guest: '/g/g1' }, supportScreens: ['/support','/reset'] };
  expect(validateFixture(f, 'https://example.test').routes).toContain('/support');
  expect(() => validateFixture({ ...f, supportScreens: ['/admin/support/accounts?email=private'] }, 'https://example.test')).toThrow();
});
it('staff SSR source guard rejects loss of current operator gate', () => {
  const guard = (s: string) => /if \(!\(await supportPageState\(\)\)\.operator\) notFound\(\)/.test(s);
  for (const path of ['accounts/page.tsx', 'accounts/[id]/page.tsx']) {
    const source = readFileSync('apps/web/src/app/admin/support/' + path, 'utf8'); expect(guard(source)).toBe(true); expect(guard(source.replace('.operator', '.account'))).toBe(false);
  }
});
