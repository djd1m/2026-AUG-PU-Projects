import { AppError } from '../../domain/common.mjs';

const TIMEOUT_MS = 8000;
const BODY_BYTES = 64 * 1024;
const MAX_ACTIVE = 4;

export const providerError = (provider, kind, status = 503) =>
  new AppError(`${provider}_${kind}`, status, 'Сервис доступа временно недоступен');

export function configEnabled(config, provider, fields) {
  if (config === undefined) return false;
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      Object.keys(config).some(key => !['enabled', ...fields].includes(key)) ||
      (config.enabled !== undefined && typeof config.enabled !== 'boolean')) {
    throw providerError(provider, 'CONFIG_INVALID');
  }
  return config.enabled === true;
}

export const credentialString = (value, max = 512) =>
  typeof value === 'string' && value.length > 0 && value.length <= max && /^[\x21-\x7e]+$/.test(value);

export const emailString = value => typeof value === 'string' && value.length <= 254 &&
  /^[^@\s<>\x00-\x1f\x7f]+@[^@\s<>\x00-\x1f\x7f]+\.[^@\s<>\x00-\x1f\x7f]+$/u.test(value);

function cancel(body) {
  // A hostile stream's cancel promise may itself never settle. Never await cleanup.
  try { Promise.resolve(body?.cancel()).catch(() => {}); } catch { /* already closed */ }
}

async function readJson(response, signal) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > BODY_BYTES)) {
    cancel(response.body);
    throw new Error('body limit');
  }
  if (!response.ok || response.redirected || !response.body ||
      !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    cancel(response.body);
    throw new Error('response invalid');
  }
  const reader = response.body.getReader();
  const abort = () => cancel(reader);
  signal.addEventListener('abort', abort, { once: true });
  const chunks = [];
  let size = 0, complete = false;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_BYTES) throw new Error('body limit');
      chunks.push(value);
    }
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('response invalid');
    complete = true;
    return data;
  } finally {
    signal.removeEventListener('abort', abort);
    if (!complete) cancel(reader);
    reader.releaseLock();
  }
}

// Instantiate once per provider module: every configured client shares the same cap.
// One admission/deadline spans all requests and all streamed response bytes.
export function boundedProvider(provider) {
  let active = 0;
  return async (fetchImpl, operation) => {
    if (active >= MAX_ACTIVE) throw providerError(provider, 'BUSY');
    active++;
    const controller = new AbortController();
    const { signal } = controller;
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(providerError(provider, 'UNAVAILABLE'));
      }, TIMEOUT_MS);
    });
    const request = async (url, options) => {
      signal.throwIfAborted();
      const response = await fetchImpl(url, { ...options, redirect: 'error', credentials: 'omit', cache: 'no-store', signal });
      if (signal.aborted) { cancel(response.body); signal.throwIfAborted(); }
      return readJson(response, signal);
    };
    try {
      return await Promise.race([Promise.resolve().then(() => operation(request)), deadline]);
    } catch {
      // No provider text, transport exception, cause, code, token or address escapes.
      throw providerError(provider, 'UNAVAILABLE');
    } finally {
      clearTimeout(timer);
      controller.abort();
      active--;
    }
  };
}
