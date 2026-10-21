import {z} from 'zod';
import {DomainError} from '@n8/domain/common';
import {createSpaceRepository} from '@n8/db/space';
import {createPinterest} from '@n8/adapters/pinterest';
import {createAssetUploader} from '@n8/adapters/assets';
import {getBase,type Base} from './composition';
import {guardRequest,readJson,route,success,RateLimitError} from './http';
const shape=z.discriminatedUnion('action',[z.object({action:z.literal('preview')}).strict(),z.object({action:z.literal('import'),imageURL:z.string().max(2048)}).strict()]);
export function pinterestReferenceHandler(projectId:string,referenceId:string,base?:Base,test?:{pinterest:ReturnType<typeof createPinterest>}){if(test&&process.env.NODE_ENV!=='test')throw Error('TEST_INJECTION_FORBIDDEN');return route(async(request,requestId)=>{const b=base??getBase(),actor=await guardRequest(request,{access:'mutation',projectId,expectedVersion:true},b,requestId);const current=await b.projects.get(actor.accountId,projectId);if(current.version!==actor.expectedVersion)throw new DomainError(409,'VERSION_CONFLICT','Проект изменился');const parsed=shape.safeParse(await readJson(request));if(!parsed.success||!z.string().uuid().safeParse(referenceId).success)throw new DomainError(422,'INVALID_REFERENCE','Некорректный запрос Pinterest');
 const ref=(await b.pool.query('SELECT * FROM reference WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL',[referenceId,projectId])).rows[0];if(!ref)throw new DomainError(404,'NOT_FOUND','Референс не найден');if(!ref.source_url||!ref.rights_confirmed)throw new DomainError(422,'INVALID_REFERENCE','Нужна сохранённая ссылка с подтверждёнными правами');
 const rate=await b.rate.hit(b.hashSubject('pinterest:'+actor.accountId),'mutation',10);if(!rate.allowed)throw new RateLimitError(rate.retryAfter);
 const pinterest=test?.pinterest??createPinterest();if(parsed.data.action==='preview')return success({images:await pinterest.discover(ref.source_url)},requestId,200,current.version);
 const image=await pinterest.download(ref.source_url,parsed.data.imageURL),repository=createSpaceRepository(b.pool),upload=createAssetUploader(b.config.assetDir,repository);
 const response=await upload(new Request('http://n8-internal/import',{method:'POST',headers:{'content-type':image.mime,'content-length':String(image.bytes.length)},body:new Uint8Array(image.bytes)}),actor.accountId,projectId,actor.expectedVersion!,'reference',true) as {asset:{id:string};version:number};
 const result=await repository.createReference(actor.accountId,projectId,response.version,{assetId:response.asset.id,note:(ref.note||'Pinterest').slice(0,1980)+' · изображение',tags:ref.tags,rightsConfirmed:true});return success({reference:result.reference,version:result.version},requestId,201,result.version);
 });}
