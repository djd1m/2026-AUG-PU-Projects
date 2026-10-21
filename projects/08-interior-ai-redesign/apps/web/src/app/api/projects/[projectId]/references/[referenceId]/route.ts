import {getSpace} from '../../../../../../server/space';
export const runtime='nodejs';
type Context={params:Promise<{projectId:string;referenceId:string}>};
export async function DELETE(request:Request,context:Context){const p=await context.params;return getSpace().reference(request,p.projectId,p.referenceId);}
