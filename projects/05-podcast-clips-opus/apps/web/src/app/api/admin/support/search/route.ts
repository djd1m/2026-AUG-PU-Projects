import { staffRoute } from '../../../../../server/support/routes';
export const runtime = 'nodejs';
export const POST: (request: Request) => Promise<Response> = staffRoute('search');
