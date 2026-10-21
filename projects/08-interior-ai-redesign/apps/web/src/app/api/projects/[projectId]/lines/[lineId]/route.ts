import {getProcurement} from '../../../../../../server/procurement';
export const runtime='nodejs';type Context={params:Promise<{projectId:string;lineId:string}>};
export async function PATCH(request:Request,context:Context){const p=await context.params;return getProcurement().line(request,p.projectId,p.lineId);}
