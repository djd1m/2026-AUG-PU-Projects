// Страж по исходнику (`source-parsing-invariant-guard`): вебхук оплаты берёт адрес ИСТОЧНИКА
// из X-Forwarded-For (поставлен нашей дверью), а не `request.ip` — адрес сокета, который при
// `trustProxy: false` всегда равен адресу двери в сети compose. С `request.ip` проверка
// происхождения ЮKassa отвергала каждое уведомление (живой стенд, 16.09.2026).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(new URL('../../apps/api/src/routes/payments-webhook.ts', import.meta.url), 'utf8');

describe('payments-webhook.ts: адрес источника уведомления', () => {
  it('sourceIp берётся через clientAddressFrom(x-forwarded-for, request.ip), не из request.ip напрямую', () => {
    expect(SRC).toMatch(/sourceIp:\s*clientAddressFrom\(request\.headers\['x-forwarded-for'\],\s*request\.ip\)/);
    expect(SRC).not.toMatch(/sourceIp:\s*request\.ip\s*,/);
  });
  it('ИСПЫТАНИЕ СТРАЖА: возвращённый дефект (sourceIp: request.ip) красит проверку', () => {
    const mutated = SRC.replace(/sourceIp:\s*clientAddressFrom\(request\.headers\['x-forwarded-for'\],\s*request\.ip\)/, 'sourceIp: request.ip');
    expect(mutated).toMatch(/sourceIp:\s*request\.ip/);
    expect(mutated).not.toMatch(/sourceIp:\s*clientAddressFrom/);
  });
});
