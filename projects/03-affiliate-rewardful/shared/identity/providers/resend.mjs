// Adapted from project01 apps/web/src/lib/email.ts: fetch, bearer auth, explicit sender.
// Official HTTP contract: https://resend.com/docs/api-reference/emails/send-email (2026-09-09).
import { boundedProvider, configEnabled, credentialString, emailString, providerError } from './http.mjs';

const sendBounded = boundedProvider('MAIL');
const ENDPOINT = 'https://api.resend.com/emails';

function sender(value) {
  if (typeof value !== 'string' || value.length > 320 || /[\x00-\x1f\x7f]/.test(value)) return false;
  if (emailString(value)) return true;
  const match = /^[^<>]+ <([^<>]+)>$/.exec(value);
  return Boolean(match && emailString(match[1]));
}

export function createResend({ config, fetchImpl = fetch } = {}) {
  const configured = configEnabled(config, 'MAIL', ['apiKey', 'from']);
  if (configured && (!credentialString(config.apiKey) || !sender(config.from) || typeof fetchImpl !== 'function')) {
    throw providerError('MAIL', 'CONFIG_INVALID');
  }
  // Capture a validated snapshot; later mutations of operator config cannot alter IO.
  const { apiKey, from } = configured ? config : {};
  return Object.freeze({
    configured,
    async send(message) {
      if (!configured) throw providerError('MAIL', 'UNCONFIGURED');
      if (!message || !emailString(message.to) || typeof message.subject !== 'string' ||
          !message.subject.trim() || message.subject.length > 200 || /[\x00-\x1f\x7f]/.test(message.subject) ||
          !['text', 'html'].every(key => typeof message[key] === 'string' && message[key].length > 0 &&
            Buffer.byteLength(message[key], 'utf8') <= 65536)) throw providerError('MAIL', 'INPUT_INVALID', 400);
      const body = JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html });
      await sendBounded(fetchImpl, async request => {
        const response = await request(ENDPOINT, {
          method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body,
        });
        if (!credentialString(response.id, 256)) throw new Error('response invalid');
      });
    },
  });
}
