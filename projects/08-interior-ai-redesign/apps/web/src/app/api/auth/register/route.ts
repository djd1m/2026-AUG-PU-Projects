import { authHandler } from '../../../../server/handlers';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = authHandler('register');
