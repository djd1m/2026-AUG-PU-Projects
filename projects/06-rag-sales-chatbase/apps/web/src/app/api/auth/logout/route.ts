// из N5: projects/05-podcast-clips-opus/apps/web/src/app/api/auth/logout/route.ts — без изменений
import { authRoute } from '../../../../server/route';
export const runtime = 'nodejs';
export const POST = authRoute('logout');
