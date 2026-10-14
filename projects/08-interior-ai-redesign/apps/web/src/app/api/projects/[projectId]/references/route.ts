import { getSpace } from '../../../../../server/space';
export const runtime='nodejs';
type Context={params:Promise<{projectId:string}>};
export async function GET(request:Request,context:Context){return getSpace().references(request,(await context.params).projectId);}
export async function POST(request:Request,context:Context){return getSpace().references(request,(await context.params).projectId);}
