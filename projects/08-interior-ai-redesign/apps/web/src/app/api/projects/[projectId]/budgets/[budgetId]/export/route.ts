import {getProcurement} from '../../../../../../../server/procurement';
export const runtime='nodejs';type Context={params:Promise<{projectId:string;budgetId:string}>};
export async function GET(request:Request,context:Context){const p=await context.params;return getProcurement().export(request,p.projectId,p.budgetId);}
