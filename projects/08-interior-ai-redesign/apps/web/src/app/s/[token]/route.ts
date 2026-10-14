import {getSharing} from '../../../server/sharing';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{token:string}>};
export async function GET(request:Request,context:Context){const p=await context.params;return getSharing().publicPage(request,p.token);}
