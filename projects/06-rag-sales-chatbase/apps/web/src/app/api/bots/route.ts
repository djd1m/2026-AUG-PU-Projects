// GET|POST /api/bots — список своих ботов и CreateBot (фича bot-cabinet, FR-BOT-001, FR-TARIFF-003, SC-US-012-3).
import { getCabinetDependencies } from '../../../server/cabinet-runtime';
import { createBotCreateHandler, createBotsListHandler } from '../../../server/cabinet-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request): Promise<Response> {
  return createBotsListHandler(getCabinetDependencies())(request);
}
export function POST(request: Request): Promise<Response> {
  return createBotCreateHandler(getCabinetDependencies())(request);
}
