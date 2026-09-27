// DELETE /api/account { confirm: true, password } — удаление аккаунта (фича account-erasure, FR-AUTH-002, A-N6-054).
import { createAccountDeleteHandler } from '../../../server/account-handler';
import { getAccountDependencies } from '../../../server/account-runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function DELETE(request: Request): Promise<Response> {
  return createAccountDeleteHandler(getAccountDependencies())(request);
}
