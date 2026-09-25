// Подменный шлюз OpenRouter для подпроцессов (node --import): настоящая сеть в тестах не вызывается.
// FAKE_GATEWAY: ok | 500 | dim1535 | noschema. FAKE_GATEWAY_LOG — файл, куда дописывается строка на
// каждый запрос (число вызовов и тело видны тесту). Чужие адреса — отказ, а не проход в сеть.
import { appendFileSync } from 'node:fs';
const mode = process.env.FAKE_GATEWAY ?? 'ok';
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  if (!href.startsWith('https://openrouter.ai/api/v1/')) throw new TypeError(`подменный шлюз: чужой адрес ${href}`);
  const body = JSON.parse(String(init.body ?? '{}'));
  if (process.env.FAKE_GATEWAY_LOG) appendFileSync(process.env.FAKE_GATEWAY_LOG, JSON.stringify({ path: href.slice('https://openrouter.ai/api/v1'.length), body }) + '\n');
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  if (mode === '500') return json({ error: 'upstream' }, 500);
  if (href.endsWith('/embeddings')) {
    const length = mode === 'dim1535' ? 1535 : body.dimensions === 1536 ? 1536 : 3072;
    return json({ data: body.input.map(() => ({ embedding: Array(length).fill(0.01) })), usage: { prompt_tokens: 2, total_tokens: 2 } });
  }
  const content = mode === 'noschema' || !body.response_format ? 'ok' : '{"ok":true}';
  return json({ choices: [{ message: { content } }], usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 } });
};
