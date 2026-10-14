import {getSpace} from '../../../../../server/space';
export const runtime='nodejs';
type Context={params:Promise<{projectId:string}>};
export async function POST(request:Request,context:Context){return getSpace().drawing(request,(await context.params).projectId);}
