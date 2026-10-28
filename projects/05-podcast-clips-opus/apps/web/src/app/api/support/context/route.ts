import { supportRoute } from '../../../../server/support/routes';
export const runtime = 'nodejs';
export const POST: (request: Request) => Promise<Response> = supportRoute('context');
