import { handleApi } from '../../../../lib/onboarding/runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return handleApi(request, 'me', await context.params);
}
