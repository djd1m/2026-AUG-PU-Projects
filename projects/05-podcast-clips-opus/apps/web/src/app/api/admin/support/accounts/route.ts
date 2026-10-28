import { staffRoute } from '../../../../../server/support/routes';
export const runtime = 'nodejs';
export const GET: (request: Request) => Promise<Response> = staffRoute('list');
