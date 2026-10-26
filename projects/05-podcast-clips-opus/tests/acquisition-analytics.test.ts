import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_STORAGE_KEY, approvedCampaign, availableClip, confirmedPayment, counterId, createAcquisitionAnalytics, routeCategory, validSdkCall, type Metrika } from '../apps/web/src/lib/acquisition-analytics';
const campaign = '?utm_source=telegram&utm_medium=community&utm_campaign=n5_pilot&utm_content=demo_a';
function fixture(throwingStorage = false) {
  let now = 1800000000000, ready: ((sdk: Metrika) => void) | undefined, loads = 0;
  const values = new Map<string, string>(), calls: unknown[][] = [];
  const storage = {
    getItem: (key: string) => { if (throwingStorage) throw Error('denied'); return values.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (throwingStorage) throw Error('denied'); values.set(key, value); },
    removeItem: (key: string) => { if (throwingStorage) throw Error('denied'); values.delete(key); },
  };
  const adapter = createAcquisitionAnalytics({ storage: () => storage, now: () => now, load: callback => { loads++; ready = callback; return () => {}; } });
  const sdk: Metrika = (...args) => { calls.push(args); };
  return { adapter, values, calls, storage, loaded: () => ready?.(sdk), loads: () => loads, advance: (ms: number) => { now += ms; } };
}
const goals = (f: ReturnType<typeof fixture>) => f.calls.filter(c => c[1] === 'reachGoal');
describe('optional closed acquisition observations', () => {
  it('accepts only positive safe decimal public IDs', () => {
    expect(counterId('123456')).toBe(123456);
    for (const value of [null, undefined, '', '0', '-1', '1.2', ' 123', '1e3', '01', '9007199254740992', '<script>']) expect(counterId(value)).toBeNull();
  });
  it('maps allowed pages to static categories and rejects sensitive routes', () => {
    expect(routeCategory('/dashboard/videos/SECRET')).toBe('video');
    expect(routeCategory('/upgrade/return')).toBe('payment_return');
    for (const path of ['/g/secret', '/api/checkout/id', '/files/id', '/showcase/id', '/dashboard/videos/id/secret', '/unknown']) expect(routeCategory(path)).toBeNull();
  });
  it('accepts only the complete exact UTM tuple without duplicates or term', () => {
    expect(approvedCampaign(campaign)).toBe(true);
    for (const search of ['', campaign + '&utm_term=email', campaign + '&utm_source=telegram', campaign.replace('demo_a', 'filename@example.com'), campaign.replace('community', 'paid')]) expect(approvedCampaign(search)).toBe(false);
  });
  it('makes no SDK calls, queue or state writes without counter/consent/allowed route', () => {
    const f = fixture();
    f.adapter.configure(null, true, '/', campaign); f.adapter.goal('n5_signup_success');
    f.adapter.configure(123, false, '/', campaign); f.adapter.goal('n5_signup_success');
    f.adapter.configure(123, true, '/g/secret', campaign); f.adapter.goal('n5_signup_success');
    expect(f.loads()).toBe(0); expect(f.values.size).toBe(0); expect(f.calls).toEqual([]);
  });
  it('initializes with collection disabled and sends only static sanitized data', () => {
    const f = fixture(); f.adapter.configure(123, true, '/', campaign + '&email=PII#SECRET'); f.loaded();
    expect(f.calls[0]).toEqual([123, 'init', expect.objectContaining({ url: 'https://clipmkr.ru/analytics/landing', referrer: 'https://clipmkr.ru/analytics/direct', defer: true, webvisor: false, clickmap: false, trackLinks: false, trackHash: false, sendTitle: false, ecommerce: false })]);
    expect(f.calls[1]).toEqual([123, 'hit', 'https://clipmkr.ru/analytics/landing', { referer: 'https://clipmkr.ru/analytics/direct', title: 'N5', params: expect.objectContaining({ route: 'landing', utm_source: 'telegram' }) }]);
    expect(JSON.stringify(f.calls)).not.toMatch(/PII|SECRET|email=/);
    expect(goals(f).map(c => c[2])).toEqual(['n5_visit']);
  });
  it('keeps only first consented touch attribution', () => {
    const f = fixture(); f.adapter.configure(123, true, '/'); f.loaded();
    f.adapter.configure(123, true, '/dashboard', campaign); f.adapter.goal('n5_signup_success');
    expect(JSON.stringify(f.calls)).not.toContain('utm_source');
  });
  it('deduplicates signup/ready/payment across reconfiguration and reload', () => {
    const f = fixture(); f.adapter.configure(123, true, '/dashboard'); f.loaded();
    for (let n = 0; n < 3; n++) { f.adapter.goal('n5_signup_success'); f.adapter.goal('n5_first_clip_ready'); f.adapter.goal('n5_payment_confirmed', 'LOCAL_INTENT'); }
    f.adapter.configure(123, true, '/dashboard');
    expect(goals(f)).toHaveLength(3); expect(JSON.stringify(f.calls)).not.toContain('LOCAL_INTENT');
    const reloaded = createAcquisitionAnalytics({ storage: () => f.storage, now: () => 1800000000001, load: ready => { ready((...args) => f.calls.push(args)); return () => {}; } });
    reloaded.configure(123, true, '/dashboard'); reloaded.goal('n5_signup_success'); reloaded.goal('n5_first_clip_ready'); reloaded.goal('n5_payment_confirmed', 'LOCAL_INTENT');
    expect(goals(f)).toHaveLength(3);
  });
  it('has finite payment dedupe and expires browser markers at thirty days', () => {
    const f = fixture(); f.adapter.configure(123, true, '/dashboard'); f.loaded();
    f.adapter.goal('n5_first_clip_ready');
    for (let n = 0; n < 25; n++) f.adapter.goal('n5_payment_confirmed', `local-${n}`);
    expect(JSON.parse(f.values.get(ANALYTICS_STORAGE_KEY)!).payments).toHaveLength(20);
    f.advance(30 * 86400000 + 1); f.adapter.goal('n5_first_clip_ready');
    expect(goals(f).filter(c => c[2] === 'n5_first_clip_ready')).toHaveLength(2);
  });
  it('does not duplicate visits on remount; starts a new visit after inactivity', () => {
    const f = fixture(); f.adapter.configure(123, true, '/'); f.loaded(); f.adapter.stop(); f.adapter.configure(123, true, '/'); f.loaded();
    expect(goals(f)).toHaveLength(1);
    f.advance(31 * 60000); f.adapter.configure(123, true, '/');
    expect(goals(f)).toHaveLength(2);
  });
  it('destroys loaded SDK on withdrawal/exclusion, clearing persistent state only on withdrawal', () => {
    for (const excluded of [false, true]) {
      const f = fixture(); f.adapter.configure(123, true, '/', campaign); f.loaded();
      if (excluded) f.adapter.configure(123, true, '/g/SECRET'); else f.adapter.withdraw();
      const count = f.calls.length; f.adapter.goal('n5_signup_success');
      expect(f.calls.at(-1)).toEqual([123, 'destruct']); expect(f.calls.length).toBe(count); expect(f.values.size).toBe(excluded ? 1 : 0);
    }
  });
  it('preserves consented attribution and success dedupe across an excluded route roundtrip', () => {
    const f = fixture(); f.adapter.configure(123, true, '/', campaign); f.loaded();
    f.adapter.goal('n5_signup_success'); f.adapter.goal('n5_first_clip_ready'); f.adapter.goal('n5_payment_confirmed', 'LOCAL');
    f.adapter.configure(123, true, '/g/SECRET');
    const count = f.calls.length; f.adapter.goal('n5_payment_confirmed', 'OTHER'); f.adapter.activity();
    expect(f.calls.length).toBe(count);
    f.adapter.configure(123, true, '/dashboard/videos/LOCAL'); f.loaded();
    f.adapter.goal('n5_signup_success'); f.adapter.goal('n5_first_clip_ready'); f.adapter.goal('n5_payment_confirmed', 'LOCAL');
    for (const name of ['n5_signup_success', 'n5_first_clip_ready', 'n5_payment_confirmed']) expect(goals(f).filter(c => c[2] === name)).toHaveLength(1);
    expect(JSON.parse(f.values.get(ANALYTICS_STORAGE_KEY)!).campaign).toBe(true);
    f.adapter.withdraw(); expect(f.values.size).toBe(0);
  });
  it('counts inactivity from the latest allowed route or tab activity, not the last landing', () => {
    const f = fixture(); f.adapter.configure(123, true, '/'); f.loaded();
    f.advance(20 * 60000); f.adapter.configure(123, true, '/dashboard');
    f.advance(11 * 60000); f.adapter.configure(123, true, '/');
    expect(goals(f).filter(c => c[2] === 'n5_visit')).toHaveLength(1);
    f.advance(20 * 60000); f.adapter.activity();
    f.advance(20 * 60000); f.adapter.configure(123, true, '/');
    expect(goals(f).filter(c => c[2] === 'n5_visit')).toHaveLength(1);
    f.advance(31 * 60000); f.adapter.configure(123, true, '/dashboard');
    f.advance(60000); f.adapter.configure(123, true, '/');
    expect(goals(f).filter(c => c[2] === 'n5_visit')).toHaveLength(2);
  });
  it('drops late SDK callbacks and bounded pending goals after withdrawal', () => {
    const f = fixture(); f.adapter.configure(123, true, '/dashboard');
    for (let n = 0; n < 100; n++) f.adapter.goal('n5_payment_confirmed', `local-${n}`);
    f.adapter.withdraw(); f.loaded(); expect(f.calls).toEqual([]);
  });
  it('bounds the pending queue even when SDK never becomes available', () => {
    const f = fixture(); f.adapter.configure(123, true, '/dashboard');
    for (let n = 0; n < 100; n++) f.adapter.goal('n5_payment_confirmed', `local-${n}`);
    f.loaded(); expect(f.calls.length).toBeLessThanOrEqual(21);
  });
  it('keeps working with denied/corrupt storage and throwing SDK', () => {
    const f = fixture(true); expect(() => { f.adapter.configure(123, true, '/'); f.loaded(); f.adapter.goal('n5_signup_success'); f.adapter.goal('n5_signup_success'); f.adapter.withdraw(); }).not.toThrow();
    expect(goals(f).filter(c => c[2] === 'n5_signup_success')).toHaveLength(1);
    const broken = fixture(); broken.values.set(ANALYTICS_STORAGE_KEY, '{corrupt'); broken.adapter.configure(123, true, '/'); broken.loaded(); expect(goals(broken)).toHaveLength(1);
    const adapter = createAcquisitionAnalytics({ storage: () => f.storage, now: Date.now, load: ready => { ready(() => { throw Error('SDK blocked'); }); return () => {}; } });
    expect(() => { adapter.configure(123, true, '/'); adapter.goal('n5_signup_success'); adapter.withdraw(); }).not.toThrow();
  });
  it('requires done AND available for browser clip observation', () => {
    expect(availableClip([{ status: 'done', available: true }])).toBe(true);
    for (const clip of [{ status: 'done', available: false }, { status: 'queued', available: true }, { status: 'failed', available: false }]) expect(availableClip([clip])).toBe(false);
  });
  it('requires exact raw intent identity and literal confirmed status', () => {
    expect(confirmedPayment('A', { intent_id: 'A', status: 'succeeded', account_plan: 'free' })).toBe(true);
    for (const data of [null, {}, { intent_id: 'B', status: 'succeeded' }, { intent_id: 'A', status: 'pending', account_plan: 'paid' }, { intent_id: 'A', status: 'canceled' }, { intent_id: 'A', status: true }]) expect(confirmedPayment('A', data)).toBe(false);
  });
});


it('admits only closed sanitized SDK bridge calls and rejects injected fields', () => {
  const f = fixture(); f.adapter.configure(123, true, '/', campaign); f.loaded(); f.adapter.goal('n5_signup_success');
  for (const call of f.calls) expect(validSdkCall(call)).toBe(true);
  const init = f.calls[0]!; expect(validSdkCall([init[0], init[1], { ...init[2] as object, webvisor: true }])).toBe(false);
  expect(validSdkCall([123, 'hit', 'https://localhost/private?email=PII', {}])).toBe(false);
  expect(validSdkCall([123, 'reachGoal', 'form://auth', {}])).toBe(false);
  const goal = f.calls.find(call => call[1] === 'reachGoal')!;
  expect(validSdkCall([123, 'reachGoal', goal[2], { ...goal[3] as object, email: 'PII' }])).toBe(false);
  expect(validSdkCall([123, 'reachGoal', goal[2], { ...goal[3] as object, utm_source: 'injected' }])).toBe(false);
  expect(validSdkCall([123, 'userParams', { email: 'PII' }])).toBe(false);
  expect(validSdkCall(['123', 'destruct'])).toBe(false);
  expect(validSdkCall([123, 'destruct'])).toBe(true);
});


it('pins the isolated SDK document base before scripts to prevent inherited parent URLs', () => {
  const source = readFileSync('apps/web/src/lib/acquisition-analytics.ts', 'utf8');
  const document = source.slice(source.indexOf('frame.srcdoc ='));
  expect(document).toMatch(/<base href="https:\/\/clipmkr\.ru\/analytics\/">/);
  expect(document.indexOf('<base ')).toBeLessThan(document.indexOf('<script>'));
});
