import { z } from 'zod';
import { DomainError } from '../common.js';
export interface ReferenceInput {assetId:string|null;sourceURL:string|null;tags:('color'|'material'|'form')[];note:string;rightsConfirmed:true}
export interface Reference extends ReferenceInput {id:string;projectId:string;createdAt:string;observedAt:string}
const shape=z.object({assetId:z.string().uuid().nullable().optional(),sourceURL:z.string().max(2048).nullable().optional(),tags:z.array(z.enum(['color','material','form'])).max(3),note:z.string().max(2000),rightsConfirmed:z.literal(true)}).strict();
export function validateReference(input:unknown):ReferenceInput {
 const parsed=shape.safeParse(input); if(!parsed.success) throw new DomainError(422,'INVALID_REFERENCE','Проверьте источник, права, заметку и теги');
 const data=parsed.data; const assetId=data.assetId??null,sourceURL=data.sourceURL??null;
 if((assetId===null)===(sourceURL===null)) throw new DomainError(422,'INVALID_REFERENCE','Укажите ровно один источник: изображение или HTTPS-ссылку');
 if(sourceURL!==null) {let url:URL;try{url=new URL(sourceURL);}catch{throw new DomainError(422,'INVALID_REFERENCE','Некорректная ссылка');}
  if(url.protocol!=='https:'||url.username||url.password||!url.hostname||/[\u0000-\u0020\u007f\\]/.test(sourceURL)) throw new DomainError(422,'INVALID_REFERENCE','Нужна HTTPS-ссылка без логина и пароля');
 }
 return {assetId,sourceURL,tags:[...new Set(data.tags)],note:data.note,rightsConfirmed:true};
}
