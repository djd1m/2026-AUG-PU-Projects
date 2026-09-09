import { randomBytes } from 'node:crypto';
import { assert, object, safeTree, str, id, hash } from '../domain/common.mjs';
import { emailInput } from '../identity/password.mjs';
import { transaction } from '../infrastructure/postgres.mjs';
import { day, iso, uuid, publishedPolicy, eligible, destination, bindingResult } from './helpers.mjs';
import { metrics } from './metrics.mjs';

const randomToken = () => randomBytes(32).toString('base64url');
function tokenHash(value, code = 'UNAUTHENTICATED', status = 401) {
  assert(typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value), code, status, 'Ключ или ссылка недействительны');
  return hash(value);
}
export function createReferrals({ pool, identity, now = Date.now }) {
  function fresh(resolved) {
    assert(new Date(resolved.expires_at).getTime() > now(), 'UNAUTHENTICATED', 401, 'Срок ключа истёк');
  }
  async function authorize(client, connector) {
    const digest = tokenHash(connector);
    // Candidate lookup holds no credential lock. Every writer uses account → membership → tenant → credential.
    const candidate = (await client.query('SELECT account_id,tenant_id FROM referral_credentials WHERE token_hash=$1', [digest])).rows[0];
    assert(candidate, 'UNAUTHENTICATED', 401, 'Ключ недействителен');
    const account = (await client.query('SELECT id,version FROM accounts WHERE id=$1 FOR SHARE', [candidate.account_id])).rows[0];
    if(account)await identity.assertVerified(client,account.id);
    const member = (await client.query('SELECT actor_id FROM memberships WHERE account_id=$1 AND tenant_id=$2 FOR SHARE',
      [candidate.account_id, candidate.tenant_id])).rows[0];
    const tenant = (await client.query("SELECT state FROM tenants WHERE id=$1 AND mode='real' FOR UPDATE", [candidate.tenant_id])).rows[0];
    const key = (await client.query('SELECT * FROM referral_credentials WHERE token_hash=$1 FOR SHARE', [digest])).rows[0];
    assert(account && member && tenant && key && key.account_id === candidate.account_id && key.tenant_id === candidate.tenant_id &&
      key.version === account.version && !key.revoked_at && tenant.state.actors.some(a => a.id === member.actor_id && a.role === 'merchant'),
    'UNAUTHENTICATED', 401, 'Ключ недействителен');
    const resolved = { tenant_id: key.tenant_id, account_id: key.account_id, actor_id: member.actor_id, expires_at: key.expires_at };
    fresh(resolved); return resolved;
  }
  async function owner(client, token, membershipId) {
    const resolved = await identity.resolveUser(client, token, membershipId);
    const { state, actor } = await identity.lockedState(client, resolved);
    assert(actor.role === 'merchant', 'FORBIDDEN', 403); identity.fresh(resolved.expires_at);
    return { resolved, state };
  }
  async function program(client, tenantId) {
    const value = (await client.query('SELECT * FROM referral_programs WHERE tenant_id=$1', [tenantId])).rows[0];
    assert(value, 'PROGRAM_NOT_FOUND', 404, 'Интеграция ещё не настроена'); return value;
  }
  async function configure(token, membershipId, input) {
    safeTree(input); object(input, ['landingUrl', 'returnUrl'], ['landingUrl', 'returnUrl']);
    const landing = destination(input.landingUrl), returning = destination(input.returnUrl);
    assert(landing.origin === returning.origin);
    return transaction(pool, async client => {
      const { resolved, state } = await owner(client, token, membershipId); publishedPolicy(state);
      await client.query(`INSERT INTO referral_programs(tenant_id,landing_url,return_url,updated_at) VALUES($1,$2,$3,$4)
        ON CONFLICT(tenant_id) DO UPDATE SET landing_url=$2,return_url=$3,updated_at=$4`,
      [resolved.tenant_id, landing.href, returning.href, new Date(now())]);
      identity.fresh(resolved.expires_at);
      return { configured: true, landingUrl: landing.href, returnUrl: returning.href };
    });
  }
  async function rotate(token, membershipId) {
    return transaction(pool, async client => {
      const { resolved, state } = await owner(client, token, membershipId); publishedPolicy(state); await program(client, resolved.tenant_id);
      const value = randomToken(), created = now(), expiresAt = iso(created + 90 * day);
      const account = (await client.query('SELECT version FROM accounts WHERE id=$1', [resolved.account_id])).rows[0];
      await client.query('DELETE FROM referral_credentials WHERE tenant_id=$1', [resolved.tenant_id]);
      await client.query(`INSERT INTO referral_credentials(token_hash,tenant_id,account_id,version,expires_at,created_at)
        VALUES($1,$2,$3,$4,$5,$6)`, [hash(value), resolved.tenant_id, resolved.account_id, account.version, expiresAt, iso(created)]);
      identity.fresh(resolved.expires_at); return { token: value, expiresAt };
    });
  }
  async function revoke(token, membershipId) {
    return transaction(pool, async client => {
      const { resolved } = await owner(client, token, membershipId);
      await client.query('UPDATE referral_credentials SET revoked_at=$2 WHERE tenant_id=$1', [resolved.tenant_id, new Date(now())]);
      identity.fresh(resolved.expires_at); return { revoked: true };
    });
  }
  async function visit(actorId) {
    uuid(actorId);
    return transaction(pool, async client => {
      const member = (await client.query(`SELECT m.tenant_id FROM memberships m JOIN tenants t ON t.id=m.tenant_id
        WHERE m.actor_id=$1 AND t.mode='real' FOR SHARE OF m`, [actorId])).rows[0];
      assert(member, 'PROGRAM_NOT_FOUND', 404);
      const state = (await client.query("SELECT state FROM tenants WHERE id=$1 AND mode='real' FOR UPDATE", [member.tenant_id])).rows[0]?.state;
      assert(state && eligible(state, actorId), 'REFERRAL_INACTIVE', 409, 'Партнёр не участвует в программе');
      const policy = publishedPolicy(state), config = await program(client, member.tenant_id);
      const count = (await client.query('SELECT count(*)::int AS n FROM referral_visits WHERE tenant_id=$1', [member.tenant_id])).rows[0].n;
      assert(count < 100000, 'REFERRAL_LIMIT', 429);
      const value = randomToken(), created = now(), expires = created + policy.windowDays * day;
      await client.query(`INSERT INTO referral_visits(id,token_hash,tenant_id,beneficiary_id,policy_id,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [id(), hash(value), member.tenant_id, actorId, policy.id, iso(created), iso(expires)]);
      const location = new URL(config.landing_url); location.searchParams.set('n3_ref', value);
      location.searchParams.set('n3_ref_expires', iso(expires)); return { location: location.href };
    });
  }
  async function trackerConfig(tenantId) {
    uuid(tenantId);
    return transaction(pool, async client => {
      const state = (await client.query("SELECT state FROM tenants WHERE id=$1 AND mode='real'", [tenantId])).rows[0]?.state;
      assert(state, 'PROGRAM_NOT_FOUND', 404); const policy = publishedPolicy(state), config = await program(client, tenantId);
      return { tenantId, windowDays: policy.windowDays, landingOrigin: new URL(config.landing_url).origin };
    });
  }
  async function customer(client, tenantId, customerId) {
    uuid(tenantId); str(customerId, 160);
    const row = (await client.query('SELECT * FROM referral_customers WHERE tenant_id=$1 AND external_id=$2', [tenantId, customerId])).rows[0];
    assert(row, 'CUSTOMER_NOT_FOUND', 404, 'Зарегистрируйте клиента через интеграцию'); return row;
  }
  async function bind(connector, input) {
    safeTree(input); object(input, ['customerId', 'email', 'emailVerified', 'visitToken', 'promoCode'], ['customerId', 'email', 'emailVerified']);
    str(input.customerId, 160); assert(input.emailVerified === true, 'EMAIL_UNVERIFIED', 400, 'Подтвердите почту клиента');
    const emailHash = hash(emailInput(input.email));
    if (Object.hasOwn(input, 'promoCode')) str(input.promoCode, 160);
    if (Object.hasOwn(input, 'visitToken')) tokenHash(input.visitToken, 'INVALID_REFERRAL', 400);
    return transaction(pool, async client => {
      const resolved = await authorize(client, connector);
      const previous = (await client.query('SELECT * FROM referral_customers WHERE tenant_id=$1 AND external_id=$2', [resolved.tenant_id, input.customerId])).rows[0];
      if (previous) {
        assert(previous.email_hash === emailHash, 'CUSTOMER_CONFLICT', 409, 'Клиент уже связан с другой почтой');
        fresh(resolved); return bindingResult(previous);
      }
      const state = (await client.query('SELECT state FROM tenants WHERE id=$1', [resolved.tenant_id])).rows[0].state;
      publishedPolicy(state); await program(client, resolved.tenant_id);
      let beneficiary = null, channel = 'none', sourceId = null, attributedAt = null, expired = false;
      if (Object.hasOwn(input, 'promoCode')) {
        const partner = state.actors.find(a => a.promoCode === input.promoCode);
        assert(partner && eligible(state, partner.id), 'INVALID_REFERRAL', 400, 'Промокод недействителен');
        beneficiary = partner.id; channel = 'promo'; attributedAt = iso(now());
      } else if (Object.hasOwn(input, 'visitToken')) {
        const visit = (await client.query('SELECT * FROM referral_visits WHERE token_hash=$1 AND tenant_id=$2',
          [hash(input.visitToken), resolved.tenant_id])).rows[0];
        assert(visit, 'INVALID_REFERRAL', 400, 'Ссылка недействительна');
        expired = new Date(visit.expires_at).getTime() <= now();
        sourceId = visit.id;
        if (!expired) {
          assert(eligible(state, visit.beneficiary_id), 'INVALID_REFERRAL', 400);
          beneficiary = visit.beneficiary_id; channel = 'link'; sourceId = visit.id; attributedAt = iso(visit.created_at);
        }
      }
      const identities = (await client.query(`SELECT a.email,m.actor_id FROM memberships m JOIN accounts a ON a.id=m.account_id
        WHERE m.tenant_id=$1`, [resolved.tenant_id])).rows;
      const owners = new Set(state.actors.filter(a => a.role === 'merchant').map(a => a.id));
      assert(!beneficiary || !identities.some(a => (a.actor_id === beneficiary || owners.has(a.actor_id)) && hash(emailInput(a.email)) === emailHash),
        'SELF_REFERRAL', 409, 'Нельзя рекомендовать себя');
      const count = (await client.query('SELECT count(*)::int AS n FROM referral_customers WHERE tenant_id=$1', [resolved.tenant_id])).rows[0].n;
      assert(count < 10000, 'REFERRAL_LIMIT', 429);
      const row = (await client.query(`INSERT INTO referral_customers(id,tenant_id,external_id,email_hash,beneficiary_id,channel,attributed_at,registered_at,source_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id(), resolved.tenant_id, input.customerId, emailHash, beneficiary, channel, attributedAt, iso(now()), sourceId])).rows[0];
      fresh(resolved); const result = bindingResult(row);
      if (expired) result.attribution.reason = 'attribution_expired';
      return result;
    });
  }
  async function status(token, membershipId) {
    return transaction(pool, async client => {
      const resolved = await identity.resolveUser(client, token, membershipId), { state, actor } = await identity.lockedState(client, resolved);
      assert(['merchant', 'partner'].includes(actor.role), 'FORBIDDEN', 403);
      const projection = await metrics(client, resolved.tenant_id, state, actor.role === 'partner' ? actor.id : null, now());
      if (actor.role === 'partner') { identity.fresh(resolved.expires_at); return { metrics: projection }; }
      const config = (await client.query('SELECT * FROM referral_programs WHERE tenant_id=$1', [resolved.tenant_id])).rows[0];
      const key = (await client.query(`SELECT c.expires_at FROM referral_credentials c JOIN accounts a ON a.id=c.account_id
        WHERE c.tenant_id=$1 AND c.version=a.version AND c.revoked_at IS NULL AND c.expires_at>$2`,
      [resolved.tenant_id, new Date(now())])).rows[0];
      identity.fresh(resolved.expires_at);
      return { configured: !!config, ...(config ? { landingUrl: config.landing_url, returnUrl: config.return_url } : {}),
        keyActive: !!key, keyExpiresAt: key ? iso(key.expires_at) : null, metrics: projection };
    });
  }
  return { configure, rotate, revoke, status, visit, trackerConfig, bind, authorize, customer, fresh };
}
