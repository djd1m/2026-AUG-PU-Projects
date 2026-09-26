// POST /api/bots/{bot_id}/ask — тестовый чат владельца по своему боту (FR-BOT-001, A-N6-033).
import { getCabinetDependencies } from '../../../../../server/cabinet-runtime';
import { createOwnerAskHandler } from '../../../../../server/cabinet-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ botId: string }> }): Promise<Response> {
  return createOwnerAskHandler(getCabinetDependencies())(request, (await context.params).botId);
}
