import { afterAll, describe, expect, it } from 'vitest';
import { seed, cleanup, withService, withAccount, TENANT } from './helpers/n3-fixture';
import { issueN3Proof, consumeN3Proof, hashProofToken } from '../src/lib/n3-proof';
import { readN3Receipt, signupReceipt, captureSignup } from '../src/lib/n3-referral';
import { GET as start } from '../src/app/n3/start/route';
import { GET as program } from '../src/app/api/n3/program/route';

afterAll(cleanup);
describe('N3 proof and immutable referral', () => {
  it('proof consumption atomically queues signup and rejects replay', async () => {
    const a = await seed();
    const proof = await withService(c => issueN3Proof(c, a, a.accountId));
    if (proof.alreadyVerified) throw new Error('new proof expected');
    const stored = (await withService(c => c.query('select token_hash from n3_email_tokens where id=$1', [proof.id]))).rows[0];
    expect(stored.token_hash).toBe(hashProofToken(proof.token)); expect(stored.token_hash).not.toBe(proof.token);
    const results = await Promise.all(Array.from({ length: 8 }, () => withService(c => consumeN3Proof(c, a, proof.token))));
    expect(results.filter(Boolean)).toHaveLength(1);
    const jobs = (await withService(c => c.query("select * from n3_bridge_outbox where account_id=$1 and kind='signup'", [a.accountId]))).rows;
    expect(jobs).toHaveLength(1); expect(jobs[0].payload).toMatchObject({ customerId: a.accountId, email: a.email, emailVerified: true, visitToken: 'v'.repeat(43) });
    expect(jobs[0].delivered_at).toBeNull();
  });
  it('expired revoked foreign and replaced-session proof cannot verify', async () => {
    const a = await seed(), b = await seed();
    const issued = await withService(c => issueN3Proof(c, a, a.accountId));
    if (issued.alreadyVerified) throw new Error('new proof expected');
    expect(await withService(c => consumeN3Proof(c, b, issued.token))).toBe(false);
    await withService(c => c.query('update sessions set revoked_at=now() where account_id=$1', [a.accountId]));
    await expect(withService(c => consumeN3Proof(c, a, issued.token))).rejects.toMatchObject({ status: 401 });
    const other = await seed();
    const token = await withService(c => issueN3Proof(c, other, other.accountId));
    if (token.alreadyVerified) throw new Error('new proof expected');
    await withService(c => c.query("update n3_email_tokens set expires_at=now()-interval '1 second' where id=$1", [token.id]));
    expect(await withService(c => consumeN3Proof(c, other, token.token))).toBe(false);
  });
  it('proof state is service only even for the owner and issuance cooldown survives concurrency', async () => {
    const a = await seed();
    await expect(withAccount(a.accountId, c => c.query('select * from n3_email_proofs'))).rejects.toMatchObject({ code: '42501' });
    await expect(withAccount(a.accountId, c => c.query('select * from n3_bridge_outbox'))).rejects.toMatchObject({ code: '42501' });
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => withService(c => issueN3Proof(c, a, a.accountId))));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(7);
  });
  it('landing GET only captures first valid host-only receipt and never verifies', async () => {
    const expiry = new Date(Date.now()+3600000).toISOString(), token = 'x'.repeat(43);
    const response = start(new Request(`https://proofwall.test/n3/start?n3_ref=${token}&n3_ref_expires=${expiry}`));
    expect(response.status).toBe(302); expect(response.headers.get('location')).toBe('https://proofwall.test/');
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie).not.toContain('Domain=');
    expect(readN3Receipt(cookie)).toBe(token);
    const repeated = start(new Request(`https://proofwall.test/n3/start?n3_ref=${'z'.repeat(43)}&n3_ref_expires=${expiry}`, { headers: { cookie } }));
    expect(repeated.headers.get('set-cookie')).toBeNull();
    expect(readN3Receipt(`n3_ref_${TENANT}=${token}.1`)).toBeUndefined();
    expect(readN3Receipt(`pw_ref=${token}.${Date.now()+3600000}`)).toBeUndefined();
    expect(readN3Receipt(`${cookie}; ${cookie}`)).toBeUndefined();
  });
  it('immutable signup snapshot keeps original distinct promo and rejects malformed input', async () => {
    const a = await seed(false), receipt = signupReceipt(null, 'N3-PROMO')!;
    await withService(c => captureSignup(c, a.accountId, receipt));
    await withService(c => captureSignup(c, a.accountId, { ...receipt, promoCode: 'CHANGED' }));
    const row = (await withService(c => c.query('select promo_code from n3_signup_contexts where account_id=$1', [a.accountId]))).rows[0];
    expect(row.promo_code).toBe('N3-PROMO');
    expect(() => signupReceipt(null, { injected: true })).toThrow();
  });
  it('disabled program hides availability and refuses silently dropping a supplied promo', async () => {
    const previous = process.env.N3_BRIDGE_ENABLED;
    try {
      process.env.N3_BRIDGE_ENABLED = 'false';
      expect(await program().json()).toEqual({ enabled: false });
      expect(signupReceipt(null,undefined)).toBeNull();
      expect(() => signupReceipt(null,'N3-PROMO')).toThrow();
      process.env.N3_BRIDGE_ENABLED = 'true';
      expect(await program().json()).toEqual({ enabled: true });
    } finally { process.env.N3_BRIDGE_ENABLED = previous; }
  });
});
