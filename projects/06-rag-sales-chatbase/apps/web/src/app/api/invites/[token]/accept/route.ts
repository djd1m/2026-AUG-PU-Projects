// POST /api/invites/{token}/accept — приём приглашения студии клиентом (фича partner-and-studio, SC-US-012-2).
import { createAcceptInviteHandler } from '../../../../../server/partner-handler';
import { getPartnerDependencies } from '../../../../../server/partner-runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  return createAcceptInviteHandler(getPartnerDependencies())(request, (await context.params).token);
}
