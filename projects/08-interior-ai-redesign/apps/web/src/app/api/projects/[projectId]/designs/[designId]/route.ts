import {revisionHandler,deleteDesignHandler} from '../../../../../../server/design';
type Context={params:Promise<{projectId:string;designId:string}>};
export async function GET(request:Request,context:Context){const p=await context.params;return revisionHandler('get',p.projectId,p.designId)(request);}
export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function DELETE(request:Request,context:Context){const p=await context.params;return deleteDesignHandler(p.projectId,p.designId)(request);}
