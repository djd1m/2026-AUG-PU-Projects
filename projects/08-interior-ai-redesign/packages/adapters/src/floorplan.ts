import {fork} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DomainError} from '@n8/domain/common';
import {extractDrawingDimensions,type DrawingRecognition} from '@n8/domain/space';
import {withAssetParserSlot} from './asset-parser.js';
const worker=join(dirname(fileURLToPath(import.meta.url)),'floorplan-worker.mjs');
export async function recognizeDrawing(path:string,hash:string,assetId:string,options:{workerPath?:string;deadlineMs?:number}={}):Promise<DrawingRecognition>{
 if((options.workerPath!==undefined||options.deadlineMs!==undefined)&&process.env.NODE_ENV!=='test')throw Error('OCR test options forbidden');
 if(process.platform!=='linux')throw new DomainError(503,'DRAWING_UNAVAILABLE','Распознавание недоступно; используйте ручной план');
 return withAssetParserSlot(()=>new Promise((resolve,reject)=>{
  const child=fork(options.workerPath??worker,[],{detached:true,execArgv:['--max-old-space-size=128'],stdio:['ignore','ignore','ignore','ipc'],env:{PATH:'/usr/bin:/bin',NODE_ENV:process.env.NODE_ENV}});let nativePid:number|null=null,settled=false,outcome:{error?:Error;value?:DrawingRecognition}|undefined;
  const kill=()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
  const finish=(error?:Error,value?:DrawingRecognition)=>{if(settled)return;settled=true;outcome={error,value};clearTimeout(timer);clearInterval(poll);kill();};
  const timer=setTimeout(()=>finish(new DomainError(422,'DRAWING_TIMEOUT','Распознавание заняло слишком долго; попробуйте более чёткий фрагмент чертежа')),options.deadlineMs??20000);
  const poll=setInterval(()=>{const ids=[child.pid,nativePid].filter((id):id is number=>typeof id==='number');void Promise.all(ids.map(id=>readFile(`/proc/${id}/status`,'utf8').then(s=>Number(/^VmRSS:\s+(\d+)/m.exec(s)?.[1]??0)).catch(()=>0))).then(rss=>{if(rss.reduce((a,b)=>a+b,0)>256*1024)finish(new DomainError(422,'DRAWING_MEMORY','Чертёж слишком сложный; загрузите фрагмент одной комнаты'));});},25);
  child.once('error',()=>finish(new DomainError(503,'DRAWING_UNAVAILABLE','Распознавание недоступно; используйте ручной план')));
  child.once('exit',()=>{if(!settled)finish(new DomainError(422,'INVALID_DRAWING','Не удалось прочитать чертёж'));});
  child.once('close',()=>{if(outcome?.error)reject(outcome.error);else if(outcome?.value)resolve(outcome.value);else reject(new DomainError(422,'INVALID_DRAWING','Распознавание завершилось без результата'));});
  child.on('message',(message:unknown)=>{if(!message||typeof message!=='object'||Array.isArray(message)){finish(new DomainError(422,'INVALID_DRAWING_OCR','Некорректный ответ распознавания'));return;}const m=message as {nativePid?:unknown;ok?:unknown;code?:unknown;result?:{width?:unknown;height?:unknown;words?:unknown}};if('nativePid'in m){nativePid=typeof m.nativePid==='number'&&Number.isSafeInteger(m.nativePid)?m.nativePid:null;return;}if(m.ok!==true){if(m.code==='OCR_TIMEOUT'){finish(new DomainError(422,'DRAWING_TIMEOUT','Распознавание заняло слишком долго; попробуйте более чёткий фрагмент чертежа'));return;}if(m.code==='OCR_OUTPUT_LIMIT'){finish(new DomainError(422,'DRAWING_OUTPUT_LIMIT','На чертеже слишком много подписей; загрузите фрагмент одной комнаты'));return;}finish(new DomainError(m.code==='OCR_UNAVAILABLE'?503:422,m.code==='OCR_UNAVAILABLE'?'DRAWING_UNAVAILABLE':'INVALID_DRAWING','Не удалось распознать размеры; загрузите более чёткий чертёж или используйте ручной план'));return;}try{const r=m.result;if(!r||!Number.isSafeInteger(r.width)||!Number.isSafeInteger(r.height)||(r.width as number)<1||(r.height as number)<1||(r.width as number)*(r.height as number)>9_000_000)throw Error('bad result');const candidates=extractDrawingDimensions(r.words);finish(undefined,{assetId,width:r.width as number,height:r.height as number,candidates,warnings:['Проверьте, какие размеры относятся к выбранной комнате. Высота, проёмы и мебель не определяются автоматически.']});}catch{finish(new DomainError(422,'INVALID_DRAWING_OCR','Не удалось проверить распознанные размеры'));}});
  child.send({path,hash});
 }));
}
