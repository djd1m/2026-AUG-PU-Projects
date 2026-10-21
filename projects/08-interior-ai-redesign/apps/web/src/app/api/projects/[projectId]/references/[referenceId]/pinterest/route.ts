import {pinterestReferenceHandler} from '../../../../../../../server/reference-pinterest';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{projectId:string;referenceId:string}>};
export async function POST(request:Request,context:Context){const p=await context.params;return pinterestReferenceHandler(p.projectId,p.referenceId)(request);}
