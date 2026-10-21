// Test-only binding for PG tests and the coordinator's later deterministic UI server.
import type { Pool } from '@n6b/db';
import { createWidgetHandler } from '@/server/widget-handler';
import { constructGateway } from '../../../../packages/rag/src/paid-call';
import { LIMITS, seedAnswerFixture } from './answer-fixture';

export const WIDGET_BASE = 'https://widget.example';
export const HOST_ORIGIN = 'https://www.shop.example';
export const VISITOR_SECRET = 'widget-fixture-secret';
export async function seedWidgetFixture(owner: Pool, cabinet: Pool, service: Pool,
  options: Parameters<typeof seedAnswerFixture>[3] = {}) {
  const fixture = await seedAnswerFixture(owner, cabinet, service, { ...options, contact: options?.contact ?? 'owner@example.test' });
  const publicId = (await owner.query<{ public_id: string }>(`UPDATE bot SET published = true,
    allowed_origins = $2 WHERE id = $1 RETURNING public_id`, [fixture.botId, [HOST_ORIGIN]])).rows[0]!.public_id;
  const gateway = constructGateway({ pool: service, provider: fixture.provider, limits: LIMITS,
    visitorSecret: VISITOR_SECRET, now: () => fixture.now });
  const deps = { servicePool: service, gateway, publicBaseUrl: WIDGET_BASE, visitorSecret: VISITOR_SECRET,
    minSimilarity: options?.threshold ?? 0.7, now: () => fixture.now, log: () => undefined };
  return { ...fixture, publicId, gateway, config: createWidgetHandler('config', deps),
    ask: createWidgetHandler('ask', deps), event: createWidgetHandler('event', deps), deps };
}

export function widgetRequest(publicId: string, kind: 'ask' | 'config' | 'event', options: {
  origin?: string | null; method?: string; body?: unknown; page?: string; ip?: string | null;
} = {}) {
  const origin = options.origin === undefined ? HOST_ORIGIN : options.origin;
  const method = options.method ?? (kind === 'config' ? 'GET' : 'POST');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (origin !== null) headers.Origin = origin;
  if (options.ip !== null) headers['X-Forwarded-For'] = options.ip ?? '192.0.2.1, 203.0.113.99';
  return new Request(`${WIDGET_BASE}/api/widget/${kind}?bot=${publicId}&page=${encodeURIComponent(options.page ?? `${HOST_ORIGIN}/contacts`)}`,
    { method, headers, ...(method === 'POST' ? { body: JSON.stringify(options.body ?? { bot: publicId, question: 'Когда доставка?' }) } : {}) });
}
