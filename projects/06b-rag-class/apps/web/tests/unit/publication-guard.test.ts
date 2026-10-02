import { expect, it, vi } from 'vitest';
import type { Pool } from '@n6b/db';
import { createPublishHandler } from '@/server/publish-handler';

const write = vi.hoisted(() => vi.fn(async (_pool, _accountId, id, input) => ({ id, public_id: 'immutable_12',
  contact: input.contact, allowed_origins: input.allowed_origins, published: true, demo_enabled: false })));
vi.mock('@n6b/db', async (original) => ({ ...await original<object>(), publishBot: write }));

it('SC-US-006-3 / PUB-02: missing contact cannot publish, write state or reveal embed code', async () => {
  const botId = '11111111-1111-1111-1111-111111111111';
  const handler = createPublishHandler({ tenantPool: {} as Pool, publicBaseUrl: 'https://cabinet.test',
    authenticate: async () => '22222222-2222-2222-2222-222222222222' });
  const request = new Request(`https://cabinet.test/api/bots/${botId}/publish`, { method: 'PATCH',
    headers: { origin: 'https://cabinet.test', 'content-type': 'application/json', cookie: `n6b_session=${'a'.repeat(43)}` },
    body: JSON.stringify({ contact: '', allowed_origins: ['https://owner.test'] }) });
  const response = await handler(request, botId);
  expect(response.status).toBe(422);
  expect(write).not.toHaveBeenCalled();
  expect(await response.text()).not.toContain('embed_code');
});
