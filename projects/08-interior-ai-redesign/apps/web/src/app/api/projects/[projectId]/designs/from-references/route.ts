import {referenceDesignHandler} from '../../../../../../server/reference-design';
type Context={params:Promise<{projectId:string}>};
export async function POST(request:Request,context:Context){const p=await context.params;return referenceDesignHandler(p.projectId)(request);}
export const runtime='nodejs';
export const dynamic='force-dynamic';
