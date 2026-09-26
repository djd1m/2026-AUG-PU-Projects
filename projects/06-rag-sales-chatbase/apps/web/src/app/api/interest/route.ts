// POST /api/interest { plan, origin_screen } — экран интереса «Оплата скоро — сообщим» (FR-TARIFF-002, SC-US-011-1).
import { getBillingDependencies } from '../../../server/billing-runtime';
import { createInterestHandler } from '../../../server/billing-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> {
  return createInterestHandler(getBillingDependencies())(request);
}
