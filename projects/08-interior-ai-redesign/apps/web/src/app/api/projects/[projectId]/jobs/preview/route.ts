import {jobsHandler} from '../../../../../../server/design';
type Context={params:Promise<{projectId:string}>};
export async function POST(request:Request,context:Context){const p=await context.params;return jobsHandler('preview',p.projectId)(request);}
export const runtime='nodejs';
export const dynamic='force-dynamic';
