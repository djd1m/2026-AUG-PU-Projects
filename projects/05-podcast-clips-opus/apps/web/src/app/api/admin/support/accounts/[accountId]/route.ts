import { staffRoute } from '../../../../../../server/support/routes';
export const runtime = 'nodejs';
const card = staffRoute('card');
export function GET(request: Request, context: { params: Promise<{ accountId: string }> }) {
  return card(request, context);
}
