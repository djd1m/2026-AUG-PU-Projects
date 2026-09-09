// Adapted from project01 apps/web/src/lib/sso.ts: code flow, S256, form exchange, OAuth profile header.
// Official contracts (2026-09-09): https://yandex.ru/dev/id/doc/ru/codes/code-url
// and https://yandex.ru/dev/id/doc/ru/user-information. State storage/identity belong to the caller.
import { createHash } from 'node:crypto';
import { boundedProvider, configEnabled, credentialString, emailString, providerError } from './http.mjs';

const profileBounded = boundedProvider('YANDEX');
const AUTHORIZE = 'https://oauth.yandex.ru/authorize';
const TOKEN = 'https://oauth.yandex.ru/token';
const INFO = 'https://login.yandex.ru/info?format=json';

function callbackInput(verifier, redirectUri) {
  let url;
  try { url = new URL(redirectUri); } catch { /* validated below */ }
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
      typeof redirectUri !== 'string' || redirectUri.length > 2048 || !url || url.href !== redirectUri ||
      url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      url.pathname !== '/api/account/yandex/callback') throw providerError('YANDEX', 'INPUT_INVALID', 400);
  // The caller must additionally enforce its exact origin allowlist and saved flow.
}

export function createYandex({ config, fetchImpl = fetch } = {}) {
  const configured = configEnabled(config, 'YANDEX', ['clientId', 'clientSecret']);
  if (configured && (!credentialString(config.clientId, 256) || !credentialString(config.clientSecret) || typeof fetchImpl !== 'function')) {
    throw providerError('YANDEX', 'CONFIG_INVALID');
  }
  const { clientId, clientSecret } = configured ? config : {};
  function ready() { if (!configured) throw providerError('YANDEX', 'UNCONFIGURED'); }
  return Object.freeze({
    configured,
    authorizationUrl({ state, verifier, redirectUri } = {}) {
      ready(); callbackInput(verifier, redirectUri);
      if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state)) throw providerError('YANDEX', 'INPUT_INVALID', 400);
      return `${AUTHORIZE}?${new URLSearchParams({
        response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
      })}`;
    },
    async profile({ code, verifier, redirectUri } = {}) {
      ready(); callbackInput(verifier, redirectUri);
      if (!credentialString(code, 2048)) throw providerError('YANDEX', 'INPUT_INVALID', 400);
      return profileBounded(fetchImpl, async request => {
        const token = await request(TOKEN, {
          method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId,
            client_secret: clientSecret, code_verifier: verifier, redirect_uri: redirectUri }),
        });
        if (typeof token.access_token !== 'string' || token.access_token.length > 8192 ||
            !/^[A-Za-z0-9._~+/=-]+$/.test(token.access_token)) throw new Error('response invalid');
        const profile = await request(INFO, { method: 'GET', headers: { authorization: `OAuth ${token.access_token}` } });
        if (!credentialString(profile.id, 256) || !emailString(profile.default_email)) throw new Error('response invalid');
        return { externalId: profile.id, email: profile.default_email.toLowerCase() };
      });
    },
  });
}
