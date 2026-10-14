import {ordersHandler} from '../../../../../server/billing';
export const runtime='nodejs';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return ordersHandler((await context.params).id)(request);}
