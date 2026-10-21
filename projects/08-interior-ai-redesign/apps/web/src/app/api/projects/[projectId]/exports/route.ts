import {getSharing} from '../../../../../server/sharing';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{projectId:string}>};
export async function GET(request:Request,context:Context){const p=await context.params;return getSharing().exports(request,p.projectId);}
export async function POST(request:Request,context:Context){const p=await context.params;return getSharing().exports(request,p.projectId);}
