import {designsHandler} from '../../../../../server/design';
type Context={params:Promise<{projectId:string}>};
export async function GET(request:Request,context:Context){const p=await context.params;return designsHandler('GET',p.projectId)(request);}
export async function POST(request:Request,context:Context){const p=await context.params;return designsHandler('POST',p.projectId)(request);}
export const runtime='nodejs';
export const dynamic='force-dynamic';
