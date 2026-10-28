import type { z } from 'zod';
import { clientIp } from '../ip';
export class SupportError extends Error {
  constructor(public code:string, public status:number, message='Запрос не выполнен') { super(message); }
}
export const supportJSON=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
export function supportFailure(error:unknown) {
  const e=error instanceof SupportError?error:new SupportError('unavailable',503,'Сервис временно недоступен');
  return supportJSON({error:{code:e.code,message:e.message}},e.status);
}
export async function supportBody<T>(request:Request,schema:z.ZodType<T>,deps:{publicOrigin:string;trustedProxyHops:number;allowIP:(ip:string)=>Promise<boolean>}) {
  const ip=clientIp(request.headers,deps.trustedProxyHops);
  if (!await deps.allowIP(ip)) throw new SupportError('rate_limited',429,'Слишком много запросов');
  if (request.headers.get('origin')!==new URL(deps.publicOrigin).origin) throw new SupportError('origin',403,'Источник запроса не разрешён');
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??'')) throw new SupportError('invalid',422);
  const reader=request.body?.getReader();
  if (!reader) throw new SupportError('invalid',422);
  const chunks:Uint8Array[]=[];let size=0;
  while(true) {
    const {value,done}=await reader.read();if(done) break;
    size+=value.byteLength;
    if(size>4096){await reader.cancel();throw new SupportError('too_large',413);}
    chunks.push(value);
  }
  let body:unknown;
  try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
  catch{throw new SupportError('invalid',422);}
  const parsed=schema.safeParse(body);if(!parsed.success) throw new SupportError('invalid',422);
  return {body:parsed.data,ip};
}
