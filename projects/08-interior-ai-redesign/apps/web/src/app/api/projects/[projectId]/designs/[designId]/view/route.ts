import {getBase} from '../../../../../../../server/composition';
import {guardRequest,route,success} from '../../../../../../../server/http';
import {createSharingRepository} from '@n8/db/sharing';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{projectId:string;designId:string}>}){const{projectId,designId}=await context.params;return route(async(req,requestId)=>{const base=getBase();const actor=await guardRequest(req,{access:'mutation',projectId},base,requestId);const recorded=await createSharingRepository(base.pool).firstDesignViewed(actor.accountId,projectId,designId,requestId);return success({recorded},requestId);})(request);}
