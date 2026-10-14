import { route, success } from '../../../server/http';
export const GET = route(async (_request, requestId) => success({ status: 'live' }, requestId));
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
