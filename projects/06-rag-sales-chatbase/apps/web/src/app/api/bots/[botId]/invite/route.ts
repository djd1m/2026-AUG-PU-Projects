// POST /api/bots/{bot_id}/invite { email } — «Передать клиенту» (фича partner-and-studio, SC-US-012-1).
import { createInviteHandler } from '../../../../../server/partner-handler';
import { getPartnerDependencies } from '../../../../../server/partner-runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ botId: string }> }): Promise<Response> {
  return createInviteHandler(getPartnerDependencies())(request, (await context.params).botId);
}
