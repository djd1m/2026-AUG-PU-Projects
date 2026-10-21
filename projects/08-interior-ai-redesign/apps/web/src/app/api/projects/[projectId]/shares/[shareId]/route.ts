import {getSharing} from '../../../../../../server/sharing';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{projectId:string;shareId:string}>};
export async function DELETE(request:Request,context:Context){const p=await context.params;return getSharing().revoke(request,p.projectId,p.shareId);}
