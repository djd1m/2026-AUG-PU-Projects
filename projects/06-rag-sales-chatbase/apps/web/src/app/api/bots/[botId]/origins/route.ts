// POST /api/bots/{bot_id}/origins — AddAllowedOrigin (FR-BOT-002, SC-US-005-2).
import { getCabinetDependencies } from '../../../../../server/cabinet-runtime';
import { createOriginAddHandler } from '../../../../../server/cabinet-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ botId: string }> }): Promise<Response> {
  return createOriginAddHandler(getCabinetDependencies())(request, (await context.params).botId);
}
