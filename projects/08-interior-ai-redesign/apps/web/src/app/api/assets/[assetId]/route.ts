import { getSpace } from '../../../../server/space';
export const runtime='nodejs';
export async function GET(request:Request,context:{params:Promise<{assetId:string}>}){return getSpace().asset(request,(await context.params).assetId);}
