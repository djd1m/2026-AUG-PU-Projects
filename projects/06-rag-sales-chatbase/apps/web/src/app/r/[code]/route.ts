// GET /r/{code} — ссылка партнёра или студии (фича partner-and-studio, FR-PARTNER-001).
import { findLiveCode } from '@n6/db';
import { createReferralHandler } from '../../../server/referral-handler';
import { getRuntime } from '../../../server/runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ code: string }> }): Promise<Response> {
  const { pool, config } = getRuntime();
  return createReferralHandler({ publicOrigin: config.publicOrigin, secret: config.sessionSecret,
    isLiveCode: async (code) => (await findLiveCode(pool, code)).kind === 'ok' })(request, (await context.params).code);
}
