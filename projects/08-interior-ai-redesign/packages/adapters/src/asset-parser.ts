import { fork } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {dirname,join} from 'node:path';
// Avoid Webpack new-URL asset rewriting: Node fork needs the real adjacent source file.
const DEFAULT_WORKER_PATH=join(dirname(fileURLToPath(import.meta.url)),'asset-parser-worker.mjs');
import { DomainError } from '@n8/domain/common';
export interface ParsedAsset {mime:string;originalHash:string;bytes:number;normalizedBytes:number;normalizedHash:string|null;metadata:Record<string,unknown>}
export interface ParseInput {originalPath:string;normalizedPath:string|null;kind:'reference'|'room_photo'|'glb'}
let active=false;
export async function withAssetParserSlot<T>(operation:()=>Promise<T>):Promise<T>{
 if(active)throw new DomainError(503,'PARSER_BUSY','Обработчик занят, повторите позже');active=true;try{return await operation();}finally{active=false;}
}
/** One decoder process per web instance; no waiting queue holding uploads or DB connections. */
export async function parseAsset(input:ParseInput,options:{deadlineMs?:number;workerPath?:string}={}):Promise<ParsedAsset> {
 if((options.deadlineMs!==undefined||options.workerPath!==undefined)&&process.env.NODE_ENV!=='test')throw new Error('Parser test options forbidden');
 return withAssetParserSlot(()=>new Promise<ParsedAsset>((resolve,reject)=>{
  const child=fork(options.workerPath??DEFAULT_WORKER_PATH,[],{execArgv:['--max-old-space-size=256'],stdio:['ignore','ignore','ignore','ipc'],env:{PATH:process.env.PATH,NODE_ENV:process.env.NODE_ENV}});
  let settled=false;let outcome:{error:Error|null;value?:ParsedAsset}|undefined;const finish=(error:Error|null,value?:ParsedAsset)=>{if(settled)return;settled=true;outcome={error,value};clearTimeout(timer);clearInterval(memory);child.kill('SIGKILL');};
  child.once('close',()=>{if(outcome?.error)reject(outcome.error);else if(outcome?.value)resolve(outcome.value);else reject(new DomainError(422,'INVALID_ASSET','Обработчик завершился без результата'));});
  const timer=setTimeout(()=>finish(new DomainError(422,'PARSE_TIMEOUT','Обработка файла превысила 10 секунд')),options.deadlineMs??10000);
  // Native decoder memory is outside V8; supervise resident memory as well as JS heap.
  const memory=setInterval(()=>{if(!child.pid)return;void readFile(`/proc/${child.pid}/status`,'utf8').then(s=>{const kb=Number(/^VmRSS:\s+(\d+)/m.exec(s)?.[1]??0);if(kb>512*1024)finish(new DomainError(422,'PARSE_MEMORY','Превышен лимит памяти обработки'));}).catch(()=>{});},25);
  child.once('error',()=>finish(new DomainError(503,'PARSER_UNAVAILABLE','Обработчик файла недоступен')));
  child.once('exit',()=>{if(!settled)finish(new DomainError(422,'INVALID_ASSET','Обработчик завершился без результата'));});
  child.on('message',(message:unknown)=>{const m=message as {ok?:boolean;result?:ParsedAsset;message?:string};if(m.ok===true&&m.result)finish(null,m.result);else finish(new DomainError(422,'INVALID_ASSET',m.message??'Некорректный файл'));});
  child.send(input);
 }));
}
