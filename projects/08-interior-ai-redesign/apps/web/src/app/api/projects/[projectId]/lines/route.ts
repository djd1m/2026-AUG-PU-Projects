import {getProcurement} from '../../../../../server/procurement';
export const runtime='nodejs';type Context={params:Promise<{projectId:string}>};
export async function GET(request:Request,context:Context){return getProcurement().lines(request,(await context.params).projectId);}
export async function POST(request:Request,context:Context){return getProcurement().lines(request,(await context.params).projectId);}
