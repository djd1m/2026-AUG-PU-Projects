import {jobHandler} from '../../../../server/design';
export async function GET(request:Request,context:{params:Promise<{jobId:string}>}){return jobHandler((await context.params).jobId)(request);}
export const runtime='nodejs';
export const dynamic='force-dynamic';
