import {getProcurement} from '../../../../../../../server/procurement';
export const runtime='nodejs';type Context={params:Promise<{projectId:string;snapshotId:string}>};
export async function POST(request:Request,context:Context){const p=await context.params;return getProcurement().refresh(request,p.projectId,p.snapshotId);}
