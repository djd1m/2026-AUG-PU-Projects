import {revisionHandler} from '../../../../../../../server/design';
type Context={params:Promise<{projectId:string;designId:string}>};
export async function POST(request:Request,context:Context){const p=await context.params;return revisionHandler('approve',p.projectId,p.designId)(request);}
export const runtime='nodejs';
export const dynamic='force-dynamic';
